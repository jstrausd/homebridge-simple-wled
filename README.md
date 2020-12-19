# Homebridge Simple WLED

Hombridge Plugin for WLED Strip ([WLED-Project by Aircoookie](https://github.com/Aircoookie/WLED))

### ⚙️ Installation / NPM Package
For downloading and installing the Plugin NPM is used in Homebridge: [Link to NPM Package](https://www.npmjs.com/package/homebridge-simple-wled)

## 🔨 Adding the Accessory to the config.json
To make the accessory visible in your HomeKIT App you have to add the accessory to the config.json

```
{
    "accessory": "WLED",
    "name": "CUSTOM_NAME_OF_ACCESSORY",
    "host": "IP_ADRESS_OF_YOUR_WLED_STRIP",
    "effectName": "Rainbow Runner",
    "log": true
}
```

## 💡 Configure own Effect-Switch
Until all effects are supported together, i have implemented a simple way to use every effect.
You just have to add a option "effectName" to your config.json and add as value a supported effect of your choice.
All effects are found under [Effects-List - WLED](https://github.com/Aircoookie/WLED/wiki/List-of-effects-and-palettes)
(Just use Names from the Effects and not from the palettes!!)

sample additional option:

```
{
    "accessory": "WLED",
    "name": "CUSTOM_NAME_OF_ACCESSORY",
    "host": "IP_ADRESS_OF_YOUR_WLED_STRIP",
    "effectName": "Merry Christmas",
}
```


```
{
    "accessory": "WLED",
    "name": "CUSTOM_NAME_OF_ACCESSORY",
    "host": "IP_ADRESS_OF_YOUR_WLED_STRIP",
    "effectName": "Halloween Eyes",
}
```

## Donation
[![](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=98XBPRTNF8BSC)
