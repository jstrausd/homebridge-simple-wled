import { API, APIEvent, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from "homebridge";
import { WLED } from "./wled-accessory";
import { loadEffects } from "./utils";

export class WLEDPlatform implements DynamicPlatformPlugin {

  accessories: PlatformAccessory[] = [];
  readonly log: Logging;
  readonly api: API;
  readonly config: PlatformConfig;
  private readonly wleds: WLED[] = [];

  constructor(log: Logging, config: PlatformConfig, api: API) {
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

    api.on(APIEvent.DID_FINISH_LAUNCHING, this.launchWLEDs.bind(this));
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.push(accessory);
  }

  private launchWLEDs(): void {

    for (const wled of this.config.wleds) {

      if (!wled.host) {
        this.log("No host or IP address has been configured.");
        return;
      }

      loadEffects(wled.host).then((effects) => {
        this.wleds.push(new WLED(this, wled, effects));
      }).catch((error) => {
        console.log(error) 
      });


    }
  }

}