
# MMM-TMB
<!-- badges: start -->
[![lifecycle](https://img.shields.io/badge/lifecycle-stable-brightgreen.svg)](https://www.tidyverse.org/lifecycle/#stable)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)
[![Twitter Follow](https://img.shields.io/twitter/follow/jaumebosch.svg?style=social)](https://twitter.com/jaumebosch)
<!-- badges: end -->
This is a module for the [MagicMirror²](https://github.com/MichMich/MagicMirror/) to display Barcelona's TMB bus times

## Introduction
[TMB](https://www.tmb.cat/en/home) (_Transports Metropolitans de Barcelona_) is the main public transport operator in Catalonia and a benchmark public mobility company in Europe and the world.

## Installation
Go to your MagicMirror's `modules` folder and execute <br />`git clone https://github.com/jaumebosch/MMM-TMB.git`
<br />Then execute <br />`npm install` <br />to download required modules.

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
| `busStops`		| *Required* Array with JSON objects defining busStop and optionally busLine. See below for example<br><br> **Type:** `array` <br> **Default value:** `none`
| `maxEntries`		| *Optional* The maximum number of buses to display. <br><br> **Possible values:** `1` to `10` <br> **Default value:** `5`
| `refreshInterval` | *Optional* How often to check for the next bus. <br><br> **Type:** `int`<br> **Default value:** `30000` milliseconds (30 seconds)
| `warningTime`		| *Optional* Time for colored alarm. <br><br> **Type:** `int`<br> **Default value:** `600` seconds (10 minutes)
| `blinkingTime`	| *Optional* Time for blinking alarm, must be less or equal than warningTime. <br><br> **Type:** `int`<br> **Default value:** `300` seconds (5 minutes)

<br />
<br />

The busStops array structure must be like this:
 ```js
[
     {
         busStopCode: '001124',
         busLine: '67',
     },
     ...
 ]
```

## busStops options
| Option 			| Description
|------------------ |-----------
| `busStopCode`		| *Required* The 6 digit bus stop code to monitor. You can get it from your bus stop or find it [here](https://www.ambmobilitat.cat/principales/BusquedaParadas.aspx).<br><br> **Type:** `string` <br> **Default value:** `none`
| `busLine`			| *Optional* The bus line number to retrieve only this line's info. If not set it will show all the bus lines of the defined bus stop <br><br> **Type:** `string` <br> **Default value:** `none`
