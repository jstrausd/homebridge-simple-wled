import {
  PlatformConfig,
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
import {PLUGIN_NAME} from "./settings";
import { WLEDPlatform } from "./wled-platform";

const axios = require('axios').default;
const polling = require("polling-to-event");

export class WLED {

  private readonly log: Logging;
  private hap: HAP;
  private api: API;
  private platform: WLEDPlatform;
  private Characteristic: any;

  private wledAccessory: PlatformAccessory;

  private name: string;
  private host: string;

  private lightService: Service;
  private effectsService: any;

  /*        LOGGING / DEBUGGING         */
  private readonly debug: boolean = false;
  private readonly prodLogging: boolean = true;
  /*       END LOGGING / DEBUGGING      */


  private effectName = "Rainbow Runner";
  private effectId = 33;
  private disableEffectSwitch: boolean;


  /*  LOCAL CACHING VARIABLES */

  private isOffline = false;

  private lightOn = false;
  private brightness = -1;
  private hue = 100;
  private saturation = 100;
  private colorArray = [255, 0, 0];

  private effectsAreActive = false;
  private effects: Array<number> = [];
  private lastPlayedEffect: number = 0;

  /*  END LOCAL CACHING VARIABLES */



  constructor(platform: WLEDPlatform, wledConfig: any) {
    this.log = platform.log;
    this.name = wledConfig.name || 'WLED';
    this.host = wledConfig.host || '127.0.0.1';
    this.prodLogging = wledConfig.log || false;
    this.disableEffectSwitch = (wledConfig.effects) ? false : true;

    this.platform = platform;
    this.api = platform.api;
    this.hap = this.api.hap;
    this.Characteristic = this.api.hap.Characteristic;
    const uuid = this.api.hap.uuid.generate('homebridge:wled' + this.name + Math.random());

    if ((this.wledAccessory = this.platform.accessories.find((x: PlatformAccessory) => x.UUID === uuid)!) === undefined) {

      this.wledAccessory = new this.api.platformAccessory(this.name, uuid);
      this.wledAccessory.category = this.api.hap.Categories.LIGHTBULB;

    }

    this.log.info("Setting up Accessory " + this.name + " with Host-IP: " + this.host);

    this.lightService = this.wledAccessory.addService(this.api.hap.Service.Lightbulb);
    this.lightService.setCharacteristic(this.Characteristic.Name, this.name);

    this.registerCharacteristicOnOff();
    this.registerCharacteristicBrightness();
    this.registerCharacteristicSaturation();
    this.registerCharacteristicHue();

    if (!this.disableEffectSwitch) {
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
    this.startPolling();
  }

  registerCharacteristicOnOff(): void {

    this.lightService.getCharacteristic(this.hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        if (this.debug)
          this.log("Current state of the switch was returned: " + (this.lightOn ? "ON" : "OFF"));

        callback(undefined, this.lightOn);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.lightOn = value as boolean;
        if (this.lightOn) {
          this.httpSendData(`http://${this.host}/win&T=1`, "GET", {}, (error: any, response: any) => { if (error) return; });
        } else {
          this.httpSendData(`http://${this.host}/win&T=0`, "GET", {}, (error: any, response: any) => { if (error) return; });
        }
        if (this.debug)
          this.log("Switch state was set to: " + (this.lightOn ? "ON" : "OFF"));
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
        if (this.debug)
          this.log("\n--------------------------------------------------\n               BRIGHTNESS\n--------------------------------------------------");

        this.brightness = Math.floor(255 / 100 * (value as number));
        this.httpSetBrightness();

        if (this.prodLogging)
          this.log("Set brightness to " + value + "%");

        if (this.debug) {
          this.log("Brightness was set to: " + this.brightness);
          this.log("\n--------------------------------------------------\n               END BRIGHTNESS\n--------------------------------------------------");
        }
        callback();
      });

  }

  registerCharacteristicHue(): void {

    this.lightService.getCharacteristic(this.hap.Characteristic.Hue)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        let colorArray = this.HSVtoRGB(this.hue, this.saturation, this.currentBrightnessToPercent());
        this.colorArray = colorArray;
        if (this.debug)
          this.log("Current hue: " + this.hue + "%");

        callback(undefined, this.hue);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        if (this.debug)
          this.log("\n--------------------------------------------------\n               HUE\n--------------------------------------------------");

        this.hue = value as number;
        this.turnOffAllEffects();
        let colorArray = this.HSVtoRGB(this.hue, this.saturation, this.currentBrightnessToPercent());
        if (this.debug)
          this.log("HUE COLOR ARRAY: " + colorArray);

        if (this.prodLogging)
          this.log("Changed color to " + colorArray);

        this.httpSendData(`http://${this.host}/json`, "POST", { "bri": this.brightness, "seg": [{ "col": [colorArray] }] }, (error: any, response: any) => { if (error) return; });
        this.colorArray = colorArray;

        if (this.debug) {
          this.log("Saturation was set to: " + this.saturation + "%");
          this.log("\n--------------------------------------------------\n              END SATURATION\n--------------------------------------------------");
          this.log("Hue was set to: " + this.hue + "%");
          this.log("\n--------------------------------------------------\n              END HUE\n--------------------------------------------------");
        }
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
        if (this.debug)
          this.log("\n--------------------------------------------------\n               SATURATION\n--------------------------------------------------");
        this.saturation = value as number;
        this.turnOffAllEffects();
        callback();
      });

  }

  registerCharacteristicActive(): void {
    this.effectsService.getCharacteristic(this.Characteristic.Active)
      .on(CharacteristicEventTypes.SET, (newValue: any, callback: any) => {

        if (newValue == 0) {
          this.turnOffAllEffects();
          this.effectsAreActive = false;
        } else {
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
          this.httpSendData(`http://${this.host}/json`, "POST", { "seg": [{ "fx": effectID, "sx": 20 }] }, (error: any, resp: any) => { if (error) return; });
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
    let colorArray = this.HSVtoRGB(this.hue, this.saturation, this.currentBrightnessToPercent());
    this.colorArray = colorArray;
    if (this.debug)
      this.log("COLOR ARRAY BRIGHTNESS: " + colorArray);
    this.httpSendData(`http://${this.host}/json`, "POST", { "bri": this.brightness, "seg": [{ "col": [colorArray] }] }, (error: any, response: any) => { if (error) return; });
  }


  turnOffAllEffects(): void {
    this.httpSendData(`http://${this.host}/json`, "POST", { "seg": [{ "fx": 0, "sx": 0, "col": this.colorArray }] }, (error: any, response: any) => { if (error) return; });
    if (this.debug)
      this.log("Turned off Effects!");
  }

  getEffectIdByName(name: string): number {
    let effectNr = this.getAllEffects().indexOf(name);
    if (effectNr >= 0)
      return effectNr;
    else
      return this.getAllEffects().indexOf("Rainbow Runner");
  }

  getAllEffects(): Array<string> {
    return [
      "Solid", "Blink", "Breathe", "Wipe", "Wipe Random", "Random Colors", "Sweep", "Dynamic", "Colorloop", "Rainbow",
      "Scan", "Scan Dual", "Fade", "Theater", "Theater Rainbow", "Running", "Saw", "Twinkle", "Dissolve", "Dissolve Rnd",
      "Sparkle", "Sparkle Dark", "Sparkle+", "Strobe", "Strobe Rainbow", "Strobe Mega", "Blink Rainbow", "Android", "Chase", "Chase Random",
      "Chase Rainbow", "Chase Flash", "Chase Flash Rnd", "Rainbow Runner", "Colorful", "Traffic Light", "Sweep Random", "Running 2", "Red & Blue", "Stream",
      "Scanner", "Lighthouse", "Fireworks", "Rain", "Merry Christmas", "Fire Flicker", "Gradient", "Loading", "Police", "Police All",
      "Two Dots", "Two Areas", "Circus", "Halloween", "Tri Chase", "Tri Wipe", "Tri Fade", "Lightning", "ICU", "Multi Comet",
      "Scanner Dual", "Stream 2", "Oscillate", "Pride 2015", "Juggle", "Palette", "Fire 2012", "Colorwaves", "Bpm", "Fill Noise",
      "Noise 1", "Noise 2", "Noise 3", "Noise 4", "Colortwinkles", "Lake", "Meteor", "Meteor Smooth", "Railway", "Ripple",
      "Twinklefox", "Twinklecat", "Halloween Eyes", "Solid Pattern", "Solid Pattern Tri", "Spots", "Spots Fade", "Glitter", "Candle", "Fireworks Starburst",
      "Fireworks 1D", "Bouncing Balls", "Sinelon", "Sinelon Dual", "Sinelon Rainbow", "Popcorn", "Drip", "Plasma", "Percent", "Ripple Rainbow",
      "Heartbeat", "Pacifica", "Candle Multi", "Solid Glitter", "Sunrise", "Phased", "Twinkleup", "Noise Pal", "Sine", "Phased Noise",
      "Flow", "Chunchun", "Dancing Shadows", "Washing Machine"
    ];
  }

  updateLight(): void {
    this.lightService.updateCharacteristic(this.hap.Characteristic.On, this.lightOn);
    this.lightService.updateCharacteristic(this.hap.Characteristic.Brightness, this.currentBrightnessToPercent());
    this.lightService.updateCharacteristic(this.hap.Characteristic.Saturation, this.saturation);
    this.lightService.updateCharacteristic(this.hap.Characteristic.Hue, this.hue);
  }



  startPolling(): void {
    var that = this;
    var status = polling(function (done: any) {
      if (!that.isOffline)
        that.httpSendData(`http://${that.host}/json/state`, "GET", {}, (error: any, response: any) => {
          done(error, response);
        })
      else
        that.isOffline = false;

    }, { longpolling: true, interval: 6000, longpollEventName: "statuspoll" });

    status.on("poll", function (response: any) {
      /*if(that.debug){
        that.log("Response: " + JSON.stringify(response["data"]));
        that.log("RainbowRunnerOn: " + that.rainbowRunnerOn);
        that.log("Data: " + JSON.stringify(response["data"]["seg"][0]["fx"]));
        that.log("Data-Bool: " + (response["data"]["seg"][0]["fx"] == 33 ? true : false));
        that.log("Current Switch State: " + that.switchService.getCharacteristic(hap.Characteristic.On).value);
      }*/
      let rainbowRunnerOnData = (response["data"]["seg"][0]["fx"] == that.effectId ? true : false);

      let colorResponse = response["data"]["seg"][0]["col"][0];
      colorResponse = [colorResponse[0], colorResponse[1], colorResponse[2]]

      if (that.lightOn != response["data"]["on"] ||
        that.brightness != response["data"]["bri"] ||
        !that.colorArraysEqual(colorResponse, that.colorArray)) {

        if (that.prodLogging)
          that.log("Updating WLED in HomeKIT (Because of Polling)")

        that.lightOn = response["data"]["on"];

        that.saveColorArrayAsHSV(colorResponse);
        that.colorArray = colorResponse;
        that.brightness = response["data"]["bri"];

        that.updateLight();
      }
    });

    status.on("error", function (error: any, response: any) {
      if (error) {
        that.log("Error while polling WLED " + that.name + " (" + that.host + ")");
        that.isOffline = true;
        return;
      }
    })
  }


  httpSendData(url: string, method: string, data: object, callback: Function): void {
    if (method.toLowerCase() == "post") {
      axios.post(String(url), data)
        .then(function (response: any) {
          callback(null, response)
        })
        .catch(function (error: any) {
          callback(error, null)
        });
    } else if (method.toLowerCase() == "get") {
      axios.get(url)
        .then(function (response: any) {
          callback(null, response)
        })
        .catch(function (error: any) {
          callback(error, null)
        })
    }
  }

  currentBrightnessToPercent() {
    return Math.floor(100 / 255 * this.brightness);
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
  * h  Object = {h:x, s:y, v:z}
  * OR 
  * h, s, v
  */
  HSVtoRGB(h: any, s: any, v: any): any {
    h = h / 360;
    s = s / 100;
    v = v / 100;

    var r, g, b, i, f, p, q, t;
    if (arguments.length === 1) {
      s = h.s, v = h.v, h = h.h;
    }
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v, g = t, b = p; break;
      case 1: r = q, g = v, b = p; break;
      case 2: r = p, g = v, b = t; break;
      case 3: r = p, g = q, b = v; break;
      case 4: r = t, g = p, b = v; break;
      case 5: r = v, g = p, b = q; break;
    }
    return [
      Math.round(r * 255),
      Math.round(g * 255),
      Math.round(b * 255)
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