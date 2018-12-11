/* global Module */

/* Magic Mirror
 * Module: MMM-TMB
 *
 * By
 * MIT Licensed.
 */

Module.register("MMM-TMB", {
    defaults: {
        timeFormat: config.timeFormat,
        maxEntries: 5,
        refreshInterval: 6000,
        retryDelay: 5000
    },

    requiresVersion: "2.1.0", // Required version of MagicMirror

    // Define required scripts.
    getScripts: function() {
        return ["moment.js"];
    },

    // Define requird styles
    getStyles: function() {
        return ["font-awesome.css", 'MMM-TMB.css'];
    },

    start: function() {
        Log.info('Starting module: ' + this.name);

        this.loaded = false;
        this.sendSocketNotification('CONFIG', this.config);
    },

    getDom: function() {
        var wrapper = document.createElement("div");

        if (this.config.appId === "") {
            wrapper.innerHTML = "Please set the correct <i>APP ID</i> in the config for module: " + this.name + ".";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        if (this.config.appKey === "") {
            wrapper.innerHTML = "Please set the correct <i>APP KEY</i> in the config for module: " + this.name + ".";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        if (this.config.busStationCode === "") {
            wrapper.innerHTML = "Please set the <i>Station Code</i> in the config for module: " + this.name + ".";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        if (!this.loaded) {
            wrapper.innerHTML = this.translate('LOADING');
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        var table = document.createElement("table");
        table.className = "small";

        var row = document.createElement("tr");
        table.appendChild(row);

        var dayCell = document.createElement("td");
        dayCell.innerHTML = this.iBus.lineCode;
        row.appendChild(dayCell);

        var conditionCell = document.createElement("td");
        conditionCell.innerHTML = this.iBus.tInMin;
        row.appendChild(conditionCell);


        var maxTempCell = document.createElement("td");
        maxTempCell.innerHTML = this.iBus.tInS;
        row.appendChild(maxTempCell);


        return table;
        },

// ##################################################################################
// Override getHeader method
// ##################################################################################
    getHeader: function() {
        if (!this.config.appendLocationNameToHeader) {
            return this.data.header + " 1111" ;
        }
        return this.data.header;
    },

    /* processResponse(data)
     * Uses the received data to set the various values.
     *
     */
    processResponse: function(data) {
            this.iBus = data;
            this.loaded = true;
            this.updateDom(this.config.animationSpeed);
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "STARTED") {
            this.updateDom();
        }
        else if (notification === "DATA") {
            this.loaded = true;
console.log(payload);
            this.processResponse(payload);
            this.updateDom();
        }
    },

    hours12: function(date) {
        return (date.getHours() + 24) % 12 || 12;
    },

    loadStationFile: function(callback) {
        var xobj = new XMLHttpRequest();
        xobj.overrideMimeType("application/json");
        xobj.open("GET", this.file("station_list.json"), true);
        xobj.onreadystatechange = function () {
            if (xobj.readyState == 4 && xobj.status == "200") {
                callback(xobj.responseText);
            }
        };
        xobj.send(null);
    },

})