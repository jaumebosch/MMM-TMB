# MMM-TMB
This is a module for the [MagicMirror²](https://github.com/MichMich/MagicMirror/) to display Barcelona's TMB bus times

## Installation
Go to your MagicMirror's `modules` folder and execute git clone `https://github.com/jaumebosch/MMM-TMB.git`.

## Using the module

![alt text](https://github.com/jaumebosch/MMM-TMB/blob/master/images/screenshot.png)

To use this module, add the following configuration block to the modules array in the `config/config.js` file:
```js
var config = {
    modules: [
        {
            module: 'MMM-TMB',
            position: "bottom_right",   // This can be any of the regions.
            config: {
                // See below for configurable options
            }
        }
    ]
}
```

## Configuration options

| Option 			| Description
|------------------ |-----------
| `appId`			| *Required* Your TMB API appID. If you don't have one, you can request one [here](https://developer.tmb.cat/).<br><br> **Type:** `string` <br> **Default value:** `none`
| `appKey`			| *Required* Your TMB API appKey. If you don't have one, you can request one [here](https://developer.tmb.cat/).<br><br> **Type:** `string` <br> **Default value:** `none`
| `busStopCode`		| *Required* The 6 digit bus stop code to monitor. You can get it from your bus stop or find it [here](https://www.ambmobilitat.cat/principales/BusquedaParadas.aspx).<br><br> **Type:** `string` <br> **Default value:** `none`
| `busLine`			| *Optional* The bus line number to retrieve only this line's info. <br><br> **Type:** `string` <br> **Default value:** `none`
| `maxEntries`		| *Optional* The maximum number of buses to display. <br><br> **Possible values:** `1` to `10` <br> **Default value:** `5`
| `refreshInterval` | *Optional* How often to check for the next bus. <br><br> **Type:** `int`<br> **Default value:** `30000` milliseconds (30 seconds)
| `warningTime`		| *Optional* Time for colored alarm. <br><br> **Type:** `int`<br> **Default value:** `600` seconds (10 minutes)
| `blinkingTime`	| *Optional* Time for blinking alarm, must be less or equal than warningTime. <br><br> **Default value:** `300` seconds (5 minutes)
