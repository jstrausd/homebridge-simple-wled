import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  Characteristic,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logger,
  Logging,
  Service
} from "homebridge";

const axios = require('axios').default;
const polling = require("polling-to-event");


let hap: HAP;

/*
 * Initializer function called when the plugin is loaded.
 */
export = (api: API) => {
  hap = api.hap;
  api.registerAccessory("WLED", WLED);
};

class WLED implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly name: string;
  private readonly host: string;

  private readonly lightService: Service;
  private readonly informationService: Service;

  /*        LOGGING / DEBUGGING         */
  private readonly debug: boolean = false;
  private readonly prodLogging: boolean = false;
  /*       END LOGGING / DEBUGGING      */


  private effectName = "Rainbow Runner";
  private effectId = 33;
  private disableEffectSwitch = false;
  private switchService: any;


  /*  LOCAL CACHING VARIABLES */

  private isOffline = false;

  private lightOn = false;
  private brightness = -1;
  private hue = 100;
  private saturation = 100;
  private colorArray = [];

  private rainbowRunnerOn = false;

  /*  END LOCAL CACHING VARIABLES */


  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.name = config.name;
    this.host = config.host;
    this.effectName = config.effectName;
    this.effectId = this.getEffectIdByName(this.effectName);

    this.prodLogging = config.log;

    this.log("DEBUG ON: " + this.debug)

    log.info("Setting up Accessory " + this.name + " with Host-IP: " + this.host);

    if (config.disableEffectSwitch != undefined) {
      this.disableEffectSwitch = config.disableEffectSwitch;
      if (this.disableEffectSwitch) {
        this.log("Effect-Switch disabled");
      }
    }

    this.lightService = new hap.Service.Lightbulb(this.name);

    if (!this.disableEffectSwitch) {
      this.switchService = new hap.Service.Switch(this.effectName);
      this.registerCharacteristicEffectSwitch();
    }

    this.registerCharacteristicOnOff();
    this.registerCharacteristicBrightness();
    this.registerCharacteristicSaturation();
    this.registerCharacteristicHue();

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, "Jonathan Strauss")
      .setCharacteristic(hap.Characteristic.Model, "ESP8266 WLED");

    log.info("WLED Strip finished initializing!");
    this.startPolling();
  }

  registerCharacteristicOnOff(): void {

    this.lightService.getCharacteristic(hap.Characteristic.On)
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

    this.lightService.getCharacteristic(hap.Characteristic.Brightness)
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

    this.lightService.getCharacteristic(hap.Characteristic.Hue)
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
        let colorArray = this.HSVtoRGB(this.hue,this.saturation,this.currentBrightnessToPercent());
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

    this.lightService.getCharacteristic(hap.Characteristic.Saturation)
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

  registerCharacteristicEffectSwitch(): void {

    this.switchService.getCharacteristic(hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        if (this.debug)
          this.log("Current state of the " + this.effectName + " effect was returned: " + (this.rainbowRunnerOn ? "ON" : "OFF"));
        callback(undefined, this.rainbowRunnerOn);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.rainbowRunnerOn = value as boolean;
        if (this.debug)
          this.log(value as boolean + "", this.rainbowRunnerOn);

        if (this.rainbowRunnerOn)
          this.turnOnRainbowEffect();
        else
          this.turnOffAllEffects();

        if (this.debug)
          this.log(this.effectName + " effect state was set to: " + (this.rainbowRunnerOn ? "ON" : "OFF"));

        if (this.prodLogging)
          this.log("Effect '" + this.effectName + "' set to: " + (this.rainbowRunnerOn ? "ON" : "OFF"));
        callback();
      });

  }

  httpSetBrightness() {
    let colorArray = this.HSVtoRGB(this.hue, this.saturation, this.currentBrightnessToPercent());
    this.colorArray = colorArray;
    if (this.debug)
      this.log("COLOR ARRAY BRIGHTNESS: " + colorArray);
    this.httpSendData(`http://${this.host}/json`, "POST", { "bri": this.brightness, "seg": [{ "col": [colorArray] }] }, (error: any, response: any) => { if (error) return; });
  }

  turnOnRainbowEffect(): void {
    this.httpSendData(`http://${this.host}/json`, "POST", { "seg": [{ "fx": this.getEffectIdByName(this.effectName), "sx": 20 }] }, (error: any, resp: any) => { if (error) return; });
    if (this.debug)
      this.log("Turned on " + this.effectName + " effect!");
  }

  turnOffAllEffects(): void {
    this.httpSendData(`http://${this.host}/json`, "POST", { "seg": [{ "fx": 0, "sx": 0, "col": [255, 0, 0] }] }, (error: any, response: any) => { if (error) return; });
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
    this.lightService.updateCharacteristic(hap.Characteristic.On, this.lightOn);
    this.lightService.updateCharacteristic(hap.Characteristic.Brightness, this.currentBrightnessToPercent());
    this.lightService.updateCharacteristic(hap.Characteristic.Saturation, this.saturation);
    this.lightService.updateCharacteristic(hap.Characteristic.Hue, this.hue);

    if (!this.disableEffectSwitch)
      this.switchService.updateCharacteristic(hap.Characteristic.On, this.rainbowRunnerOn);
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
      let effectSwitchState = (!that.disableEffectSwitch) ? that.switchService.getCharacteristic(hap.Characteristic.On).value != rainbowRunnerOnData : false;

      let colorResponse = response["data"]["seg"][0]["col"][0];
      colorResponse = [colorResponse[0], colorResponse[1], colorResponse[2]]

      if (that.lightOn != response["data"]["on"] ||
        that.brightness != response["data"]["bri"] ||
        effectSwitchState ||
        that.rainbowRunnerOn != rainbowRunnerOnData ||
        !that.colorArraysEqual(colorResponse, that.colorArray)) {

        if(that.prodLogging)
          that.log("Updating WLED in HomeKIT (Because of Polling)")

        that.lightOn = response["data"]["on"];
        that.rainbowRunnerOn = rainbowRunnerOnData;

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

  identify(): void {
    this.log("Identify!");
  }

  getServices(): Service[] {
    if (!this.disableEffectSwitch) {
      return [
        this.informationService,
        this.lightService,
        this.switchService,
      ];
    } else {
      return [
        this.informationService,
        this.lightService
      ];
    }
  }

  currentBrightnessToPercent() {
    return Math.floor(100 / 255 * this.brightness);
  }

  saveColorArrayAsHSV(colorArray: Array<number>): void {
    let hsvArray = this.RGBtoHSV(colorArray[0], colorArray[1], colorArray[2]);
    this.hue = Math.floor(hsvArray[0]*360);
    this.saturation = Math.floor(hsvArray[1]*100);
    this.brightness = Math.floor(hsvArray[2]*255);
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
    h = h/360;
    s = s/100;
    v = v/100;

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