import {
  API,
  CharacteristicEventTypes,
  Logging,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  Service,
  HAP,
} from "homebridge";
import { PLUGIN_NAME } from "./settings";
import { WLEDPlatform } from "./wled-platform";
import { httpSendData } from "./utils";

const polling = require("polling-to-event");

export class WLED {

  private readonly log: Logging;
  private hap: HAP;
  private api: API;
  private platform: WLEDPlatform;
  private Characteristic: any;

  private wledAccessory: PlatformAccessory;

  private name: string;
  private host: Array<string>;

  private lightService: Service;
  private ambilightService!: Service;
  private speedService!: Service;
  private effectsService!: Service;

  /*        LOGGING / DEBUGGING         */
  private readonly debug: boolean = false;
  private readonly prodLogging: boolean = false;
  /*       END LOGGING / DEBUGGING      */

  private effectId = 33;
  private multipleHosts: boolean;
  private disableEffectSwitch: boolean;
  private turnOffWledWithEffect: boolean;
  private showEffectControl: boolean;
  private ambilightSwitch: boolean;


  /*  LOCAL CACHING VARIABLES */

  private isOffline = false;

  private lightOn = false;
  private ambilightOn = false;
  private brightness = -1;
  private hue = 100;
  private saturation = 100;
  private colorArray = [255, 0, 0];

  private effectSpeed = 15;

  private effectsAreActive = false;
  private cachedAllEffects: Array<string> = [];
  private effects: Array<number> = [];
  private lastPlayedEffect: number = 0;

  /*  END LOCAL CACHING VARIABLES */

  constructor(platform: WLEDPlatform, wledConfig: any, loadedEffects: Array<string>) {
    this.log = platform.log;
    this.name = wledConfig.name || 'WLED';
    this.prodLogging = wledConfig.log || false;
    this.disableEffectSwitch = (wledConfig.effects) ? false : true;
    this.turnOffWledWithEffect = wledConfig.turnOffWledWithEffect || false;
    this.effectSpeed = wledConfig.defaultEffectSpeed || 15;
    this.showEffectControl = wledConfig.showEffectControl ? true : false;
    this.ambilightSwitch = wledConfig.ambilightSwitch ? true : false;

    this.cachedAllEffects = loadedEffects

    if (wledConfig.host instanceof Array && wledConfig.host.length > 1) {
      this.host = wledConfig.host;
      this.multipleHosts = true;
    } else {
      this.host = [wledConfig.host];
      this.multipleHosts = false;
    }

    this.platform = platform;
    this.api = platform.api;
    this.hap = this.api.hap;
    this.Characteristic = this.api.hap.Characteristic;
    const uuid = this.api.hap.uuid.generate('homebridge:wled' + this.name);

    if ((this.wledAccessory = this.platform.accessories.find((x: PlatformAccessory) => x.UUID === uuid)!) === undefined) {

      this.wledAccessory = new this.api.platformAccessory(this.name, uuid);

    }

    this.log.info("Setting up Accessory " + this.name + " with Host-IP: " + this.host + ((this.multipleHosts) ? " Multiple WLED-Hosts configured" : " Single WLED-Host configured"));

    this.wledAccessory.category = this.api.hap.Categories.LIGHTBULB;

    this.lightService = this.wledAccessory.addService(this.api.hap.Service.Lightbulb, this.name, 'LIGHT');

    if (this.showEffectControl) {
      this.speedService = this.wledAccessory.addService(this.api.hap.Service.Lightbulb, 'Effect Speed', 'SPEED');
      this.lightService.addLinkedService(this.speedService);
    }

    if (this.ambilightSwitch) {
      this.ambilightService = this.wledAccessory.addService(this.api.hap.Service.Lightbulb, 'Ambilight', 'AMBI');
      this.lightService.addLinkedService(this.ambilightService);
      this.registerCharacteristicAmbilightOnOff();
    }

    this.registerCharacteristicOnOff();
    this.registerCharacteristicBrightness();
    this.registerCharacteristicSaturation();
    this.registerCharacteristicHue();

    if (!this.disableEffectSwitch) {
      // LOAD ALL EFFECTS FROM HOST
      this.effectsService = this.wledAccessory.addService(this.api.hap.Service.Television);
      this.effectsService.setCharacteristic(this.Characteristic.ConfiguredName, "Effects");

      this.registerCharacteristicActive();
      this.registerCharacteristicActiveIdentifier();
      this.addEffectsInputSources(wledConfig.effects);
    }

    this.api.publishExternalAccessories(PLUGIN_NAME, [this.wledAccessory]);
    this.platform.accessories.push(this.wledAccessory);

    this.api.updatePlatformAccessories([this.wledAccessory]);
    this.log.info("WLED Strip finished initializing!");

    this.startPolling(this.host[0]);
  }

  registerCharacteristicOnOff(): void {

    this.lightService.getCharacteristic(this.hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        if (this.debug)
          this.log("Current state of the switch was returned: " + (this.lightOn ? "ON" : "OFF"));

        callback(undefined, this.lightOn);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        let tempLightOn = value as boolean;
        if (tempLightOn && !this.lightOn) {
          this.turnOnWLED();
          if (this.debug)
            this.log("Light was turned on!");
        } else if (!tempLightOn && this.lightOn) {
          this.turnOffWLED();
          if (this.debug)
            this.log("Light was turned off!");
        }
        this.lightOn = tempLightOn;
        callback();
      });

  }

  registerCharacteristicAmbilightOnOff(): void {

    this.ambilightService.getCharacteristic(this.hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        if (this.debug)
          this.log("Current state of the switch was returned: " + (this.ambilightOn ? "ON" : "OFF"));

        callback(undefined, this.ambilightOn);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.ambilightOn = value as boolean;
        if (this.ambilightOn) {
          this.turnOnAmbilight();
        } else {
          this.turnOffAmbilight();
        }
        if (this.debug)
          this.log("Switch state was set to: " + (this.ambilightOn ? "ON" : "OFF"));
        callback();
      });

  }

  registerCharacteristicBrightness(): void {

    this.lightService.getCharacteristic(this.hap.Characteristic.Brightness)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        if (this.debug)
          this.log("Current brightness: " + this.brightness);
        callback(undefined, this.currentBrightnessToPercent());
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {

        this.brightness = Math.round(255 / 100 * (value as number));
        this.httpSetBrightness();

        if (this.prodLogging)
          this.log("Set brightness to " + value + "% " + this.brightness);

        callback();
      });

    if (this.showEffectControl) {
      // EFFECT SPEED
      this.speedService.getCharacteristic(this.hap.Characteristic.Brightness)
        .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
          callback(undefined, Math.round(this.effectSpeed / 2.55));

        }).on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {

          this.effectSpeed = value as number;
          this.effectSpeed = Math.round(this.effectSpeed * 2.55);
          if (this.prodLogging)
            this.log("Speed set to " + this.effectSpeed);

          this.effectsService.setCharacteristic(this.Characteristic.ActiveIdentifier, this.lastPlayedEffect);

          callback();
        });
    }

  }

  registerCharacteristicHue(): void {

    this.lightService.getCharacteristic(this.hap.Characteristic.Hue)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        let colorArray = this.HSVtoRGB(this.hue, this.saturation);
        this.colorArray = colorArray;
        if (this.debug)
          this.log("Current hue: " + this.hue + "%");

        callback(undefined, this.hue);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {

        this.hue = value as number;
        this.turnOffAllEffects();
        let colorArray = this.HSVtoRGB(this.hue, this.saturation);

        this.host.forEach((host) => {
          httpSendData(`http://${host}/json`, "POST", { "bri": this.brightness, "seg": [{ "col": [colorArray] }] }, (error: any, response: any) => { if (error) this.log("Error while changing color of WLED " + this.name + " (" + host + ")"); });
          if (this.prodLogging)
            this.log("Changed color to " + colorArray + " on host " + host);
        })
        this.colorArray = colorArray;

        callback();
      });

  }

  registerCharacteristicSaturation(): void {

    this.lightService.getCharacteristic(this.hap.Characteristic.Saturation)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        if (this.debug)
          this.log("Current saturation: " + this.saturation + "%");
        callback(undefined, this.saturation);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.saturation = value as number;
        this.turnOffAllEffects();
        callback();
      });

  }

  registerCharacteristicActive(): void {
    this.effectsService.getCharacteristic(this.Characteristic.Active)
      .on(CharacteristicEventTypes.SET, (newValue: any, callback: any) => {

        if (newValue == 0) {
          if (this.turnOffWledWithEffect) {
            this.turnOffWLED();
          } else {
            this.turnOffAllEffects();
          }
          this.effectsAreActive = false;
        } else {
          if (this.turnOffWledWithEffect) {
            this.turnOnWLED();
          }
          this.effectsAreActive = true;
          this.effectsService.setCharacteristic(this.Characteristic.ActiveIdentifier, this.lastPlayedEffect);
        }

        this.effectsService.updateCharacteristic(this.Characteristic.Active, newValue);
        callback(null);
      });
  }

  registerCharacteristicActiveIdentifier(): void {
    this.effectsService.getCharacteristic(this.Characteristic.ActiveIdentifier)
      .on(CharacteristicEventTypes.SET, (newValue: CharacteristicValue, callback: CharacteristicSetCallback) => {

        if (this.effectsAreActive) {

          let effectID = this.effects[parseInt(newValue.toString())];
          this.host.forEach((host) => {
            httpSendData(`http://${host}/json`, "POST", { "seg": [{ "fx": effectID, "sx": this.effectSpeed }] }, (error: any, resp: any) => { if (error) return; });
          });
          if (this.prodLogging)
            this.log("Turned on " + newValue + " effect!");

          this.lastPlayedEffect = parseInt(newValue.toString());
        }
        callback(null);
      });
  }

  addEffectsInputSources(effects: any): void {

    if (this.prodLogging) {
      this.log("Adding effects: " + effects);
    }

    effects.forEach((effectName: string, i: number) => {
      let effectID = this.getEffectIdByName(effectName);
      this.effects.push(effectID);
      const effectInputSource = this.wledAccessory.addService(this.hap.Service.InputSource, effectID, effectName);
      effectInputSource
        .setCharacteristic(this.Characteristic.Identifier, i)
        .setCharacteristic(this.Characteristic.ConfiguredName, effectName)
        .setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(this.Characteristic.InputSourceType, this.Characteristic.InputSourceType.HDMI);
      this.effectsService.addLinkedService(effectInputSource);
    });

  }

  httpSetBrightness() {
    if (this.brightness == 0) {
      this.turnOffWLED();
      return;
    }
    let colorArray = this.HSVtoRGB(this.hue, this.saturation);
    this.colorArray = colorArray;
    if (this.debug)
      this.log("COLOR ARRAY BRIGHTNESS: " + colorArray);

    this.host.forEach((host) => {
      httpSendData(`http://${host}/json`, "POST", { "bri": this.brightness }, (error: any, response: any) => { if (error) return; });
    });
  }

  turnOffWLED(): void {
    this.host.forEach((host) => {
      httpSendData(`http://${host}/win&T=0`, "GET", {}, (error: any, response: any) => { if (error) return; });
    });
    this.lightOn = false;
  }

  turnOnWLED(): void {
    this.host.forEach((host) => {
      httpSendData(`http://${host}/win&T=1`, "GET", {}, (error: any, response: any) => { if (error) return; });
    });
    this.lightService.updateCharacteristic(this.hap.Characteristic.Brightness, 100);
    this.lightOn = true;
  }

  turnOffAmbilight(): void {
    this.host.forEach((host) => {
      httpSendData(`http://${host}/win&LO=1`, "GET", {}, (error: any, response: any) => { if (error) return; });
    });
    this.ambilightOn = false;
  }

  turnOnAmbilight(): void {
    this.host.forEach((host) => {
      httpSendData(`http://${host}/win&LO=0`, "GET", {}, (error: any, response: any) => { if (error) return; });
    });
    this.lightService.updateCharacteristic(this.hap.Characteristic.Brightness, 100);
    this.ambilightOn = true;
  }

  turnOffAllEffects(): void {
    this.host.forEach((host) => {
      httpSendData(`http://${host}/json`, "POST", { "seg": [{ "fx": 0, "sx": 0, "col": this.colorArray }] }, (error: any, response: any) => { if (error) return; });
    });
    if (!this.disableEffectSwitch)
      this.effectsService.updateCharacteristic(this.Characteristic.Active, 0);

    if (this.debug)
      this.log("Turned off Effects!");
  }

  getEffectIdByName(name: string): number {
    let effectNr = this.getAllEffects().indexOf(name);
    if (effectNr >= 0) {
      return effectNr;
    } else {
      if (this.debug)
        this.log("Effect " + name + " not found! Displaying Rainbow Runner");
      return this.getAllEffects().indexOf("Rainbow Runner");
    }
  }

  getAllEffects(): Array<string> {
    return this.cachedAllEffects;
  }

  updateLight(): void {
    this.lightService.updateCharacteristic(this.hap.Characteristic.On, this.lightOn);
    this.lightService.updateCharacteristic(this.hap.Characteristic.Brightness, this.currentBrightnessToPercent());
    this.lightService.updateCharacteristic(this.hap.Characteristic.Saturation, this.saturation);
    this.lightService.updateCharacteristic(this.hap.Characteristic.Hue, this.hue);

    if (this.ambilightService)
      this.ambilightService.updateCharacteristic(this.hap.Characteristic.On, this.ambilightOn);
  }



  startPolling(host: string): void {
    var that = this;
    var status = polling(function (done: any) {
      if (!that.isOffline)
        httpSendData(`http://${host}/json/state`, "GET", {}, (error: any, response: any) => {
          done(error, response);
        })
      else
        that.isOffline = false;

    }, { longpolling: true, interval: 4500, longpollEventName: "statuspoll" + host });

    status.on("poll", function (response: any) {

      let colorResponse = response["data"]["seg"][0]["col"][0];
      colorResponse = [colorResponse[0], colorResponse[1], colorResponse[2]]

      if (that.lightOn && response["data"]["on"] && (
        that.brightness != response["data"]["bri"] ||
        !that.colorArraysEqual(colorResponse, that.colorArray))) {

        if (that.prodLogging)
          that.log("Updating WLED in HomeKIT (Because of Polling) " + host)

        that.saveColorArrayAsHSV(colorResponse);
        that.colorArray = colorResponse;

        that.brightness = response["data"]["bri"];

        if (that.multipleHosts) {
          that.host.forEach((host) => {
            httpSendData(`http://${host}/json`, "POST", { "bri": that.brightness, "seg": [{ "col": [colorResponse] }] }, (error: any, response: any) => { if (error) that.log("Error while polling WLED (brightness) " + that.name + " (" + that.host + ")"); });
            if (that.prodLogging)
              that.log("Changed color to " + colorResponse + " on host " + host);
          })
        }

        that.updateLight();
      } else {
        that.lightOn = response["data"]["on"];
        that.updateLight();
      }


      if (that.ambilightOn && response["data"]["lor"]) {
        that.ambilightOn = !response["data"]["lor"];

        if (that.prodLogging)
          that.log("Updating WLED in HomeKIT (Because of Polling) " + host)

        if (that.multipleHosts) {
          that.host.forEach((host) => {
            httpSendData(`http://${host}/json`, "POST", { "lor": that.ambilightOn }, (error: any, response: any) => { if (error) that.log("Error while polling WLED (brightness) " + that.name + " (" + that.host + ")"); });
            if (that.prodLogging)
              that.log("Changed color to " + colorResponse + " on host " + host);
          })
        }

        that.updateLight();
      } else {
        that.ambilightOn = !response["data"]["lor"];
        that.updateLight();
      }



    });

    status.on("error", function (error: any, response: any) {
      if (error) {
        if (that.debug)
          that.log(error)
        that.log("Error while polling WLED " + that.name + " (" + that.host + ")");
        that.isOffline = true;
        return;
      }
    })
  }

  currentBrightnessToPercent() {
    return Math.round(100 / 255 * this.brightness);
  }

  saveColorArrayAsHSV(colorArray: Array<number>): void {
    let hsvArray = this.RGBtoHSV(colorArray[0], colorArray[1], colorArray[2]);
    this.hue = Math.floor(hsvArray[0] * 360);
    this.saturation = Math.floor(hsvArray[1] * 100);
    this.brightness = Math.floor(hsvArray[2] * 255);
  }

  colorArraysEqual(a: any, b: any): boolean {
    if (a[0] == b[0] && a[1] == b[1] && a[2] == b[2])
      return true;
    return false;
  }


  /* accepts parameters
  * h  Object = {h:x, s:y}
  * OR 
  * h, s
  */
  HSVtoRGB(h: any, s: any): any {
    h = h / 360;
    s = s / 100;

    var r, g, b, i, f, p, q, t;
    if (arguments.length === 1) {
      s = h.s, h = h.h;
    }
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = (1 - s);
    q = (1 - f * s);
    t = (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = 1, g = t, b = p; break;
      case 1: r = q, g = 1, b = p; break;
      case 2: r = p, g = 1, b = t; break;
      case 3: r = p, g = q, b = 1; break;
      case 4: r = t, g = p, b = 1; break;
      case 5: r = 1, g = p, b = q; break;
    }
    return [
      Math.round((r as number) * 255),
      Math.round((g as number) * 255),
      Math.round((b as number) * 255)
    ];
  }

  /* accepts parameters
  * r  Object = {r:x, g:y, b:z}
  * OR 
  * r, g, b
  */
  RGBtoHSV(r: any, g: any, b: any): any {
    if (arguments.length === 1) {
      g = r.g, b = r.b, r = r.r;
    }
    var max = Math.max(r, g, b), min = Math.min(r, g, b),
      d = max - min,
      h,
      s = (max === 0 ? 0 : d / max),
      v = max / 255;

    switch (max) {
      case min: h = 0; break;
      case r: h = (g - b) + d * (g < b ? 6 : 0); h /= 6 * d; break;
      case g: h = (b - r) + d * 2; h /= 6 * d; break;
      case b: h = (r - g) + d * 4; h /= 6 * d; break;
    }

    return [
      h,
      s,
      v
    ];
  }
}