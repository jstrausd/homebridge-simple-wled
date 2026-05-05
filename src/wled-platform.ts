import {type API, APIEvent, type DynamicPlatformPlugin, type Logging, type PlatformAccessory, type PlatformConfig} from 'homebridge';
import {WLED} from './wled-accessory';
import {PLUGIN_NAME, PLATFORM_NAME} from './settings';
import {loadEffectsViaHTTP} from './utils/wsUtils';

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

      // Verify configuration exists and is valid
      if (!config) {
          this.log.warn('No configuration provided. Plugin will not start until configured.');
          return;
      }

      // Verify wleds array exists and has entries
      if (!config.wleds || !Array.isArray(config.wleds) || config.wleds.length === 0) {
          this.log.info('No WLEDs have been configured. Plugin will not start until WLED devices are added in the Homebridge UI.');
          return;
      }

      // Verify at least one WLED has a valid host
      const hasValidWled = config.wleds.some((wled: any) => wled && wled.host && (typeof wled.host === 'string' || Array.isArray(wled.host)));

      if (!hasValidWled) {
          this.log.warn('No valid WLED configuration found. Plugin will not start until at least one WLED device with a valid host is configured.');
          return;
      }

      try {
          api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
              try {
                  this.launchWLEDs();
              } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  this.log.error(`Error during platform launch: ${errorMessage}`);
              }
          });
      } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.log.error(`Error registering platform event: ${errorMessage}`);
      }
  }

  configureAccessory(accessory: PlatformAccessory): void {
      // This plugin uses publishExternalAccessories (required for Television service).
      // Platform-cached accessories here are stale leftovers from v2.1.0/v2.1.1.
      this.log.info(`Found stale cached platform accessory: ${accessory.displayName} — will be removed.`);
      this.accessories.push(accessory);
  }

  private launchWLEDs(): void {
      if (!this.config.wleds || !Array.isArray(this.config.wleds)) {
          this.log.warn('No WLEDs configured or invalid configuration.');
          return;
      }

      // Remove any stale platform-cached accessories (this plugin uses external accessories only)
      if (this.accessories.length > 0) {
          this.log.info(`Removing ${this.accessories.length} stale platform-cached accessory/accessories.`);
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, this.accessories);
          this.accessories = [];
      }

      for (const wled of this.config.wleds) {
          try {
              if (!wled || !wled.host) {
                  this.log.warn('Skipping WLED configuration: No host or IP address configured.');
              } else {
                  // Determine primary host for effect loading
                  const primaryHost = Array.isArray(wled.host) ? wled.host[0] : wled.host;

                  loadEffectsViaHTTP(primaryHost)
                      .then(effects => {
                          try {
                              this.wleds.push(new WLED(this, wled, effects));
                          } catch (error) {
                              const errorMessage = error instanceof Error ? error.message : String(error);
                              this.log.error(`Failed to create WLED instance for ${primaryHost}: ${errorMessage}`);
                          }
                      })
                      .catch(error => {
                          const errorMessage = error instanceof Error ? error.message : String(error);
                          this.log.error(`Error loading effects for ${primaryHost}: ${errorMessage}`);

                          // Still create WLED instance with empty effects array as fallback
                          try {
                              this.wleds.push(new WLED(this, wled, []));
                          } catch (createError) {
                              const createErrorMessage = createError instanceof Error ? createError.message : String(createError);
                              this.log.error(`Failed to create WLED instance with fallback for ${primaryHost}: ${createErrorMessage}`);
                          }
                      });
              }
          } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              this.log.error(`Unexpected error processing WLED configuration: ${errorMessage}`);
          }
      }
  }
}
