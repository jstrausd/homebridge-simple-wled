"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WLEDPlatform = void 0;
const wled_accessory_1 = require("./wled-accessory");
const utils_1 = require("./utils");
class WLEDPlatform {
    constructor(log, config, api) {
        this.accessories = [];
        this.wleds = [];
        this.api = api;
        this.config = config;
        this.log = log;
        if (!config) {
            return;
        }
        if (!config.wleds) {
            this.log("No WLEDs have been configured.");
            return;
        }
        api.on("didFinishLaunching" /* APIEvent.DID_FINISH_LAUNCHING */, this.launchWLEDs.bind(this));
    }
    configureAccessory(accessory) {
        this.accessories.push(accessory);
    }
    launchWLEDs() {
        for (const wled of this.config.wleds) {
            if (!wled.host) {
                this.log("No host or IP address has been configured.");
                return;
            }
            (0, utils_1.loadEffects)(wled.host).then((effects) => {
                this.wleds.push(new wled_accessory_1.WLED(this, wled, effects));
            }).catch((error) => {
                console.log(error);
            });
        }
    }
}
exports.WLEDPlatform = WLEDPlatform;
//# sourceMappingURL=wled-platform.js.map