# Homebridge Simple WLED

Hombridge Plugin for WLED Strip ([WLED-Project by Aircoookie](https://github.com/Aircoookie/WLED))

### ⚙️ Installation / NPM Package
For downloading and installing the Plugin NPM is used in Homebridge: [Link to NPM Package](https://www.npmjs.com/package/homebridge-simple-wled)

## 🔨 Adding the Accessory to the config.json
To make the accessory visible in your HomeKIT App you have to add the Platform-Accessory to the config.json to the platforms section:

```
    "platforms": [
        {
            "platform": "WLED",
            "wleds": [
                {
                    "name": "LED-Tisch",
                    "host": "10.0.0.52",
                    "effects": ["Rainbow Runner", "Circus"],
                    "log": true
                },
                {
                    "name": "LED-Kasten",
                    "host": "10.0.0.53",
                    "effects": ["Rainbow Runner", "Circus"],
                }
            ]
        }
    ]
```

After editing the config, restart your HomeBridge Server and add the accessory manually from the Home App.
If you encounter some issues when adding the accessory to the homekit app, open an issue in GitHub...

## 💡 Configure own Effect-Switch
To use your own effects you have an option "effects" you can add to your config.json and add as value a comma-seperated list of supported effects of your choice.
All effects are found under [Effects-List - WLED](https://github.com/Aircoookie/WLED/wiki/List-of-effects-and-palettes)
(Just use Names from the Effects and not from the palettes!!)

sample additional option:

```
    "platforms": [
                {
            "platform": "WLED",
            "wleds": [
                {
                    "name": "LED-Tisch",
                    "host": "10.0.0.52",
                    "effects": ["Rainbow Runner", "Circus", "Merry Christmas", "Fireworks"],
                    "log": false
                }
            ]
        }
    ]
```

If you want to disable the Effect-Switch to just use the normal "LightBulb" function. You can just remove the "effects" option in the config.json.

## Contributing
If you have any idea, feel free to fork it and submit your changes back to me.

## Donation
You can also support me developing this plugin by buying me a coffee and giving me motivation to keep this plugin up to date and continue developing.

Thanks to everyone who is donating to me.

MoneyPool for new Graphics-Card (or other PC-Hardware):
[![](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://paypal.me/pools/c/8wny2NuaNs)

