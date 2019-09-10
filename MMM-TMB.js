/* global Module */

/* Magic Mirror
 * Module: MMM-TMB
 *
 * By @jaumebosch
 * MIT Licensed.
 */

Module.register("MMM-TMB", {
    defaults: {
        timeFormat: config.timeFormat,
        maxEntries: 5,
        refreshInterval: 30000,
        retryDelay: 5000,
        warningTime: 600,
        blinkingTime: 300,

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
            wrapper.innerHTML = "Please set the correct <i>APP ID</i> in the config for module";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        if (this.config.appKey === "") {
            wrapper.innerHTML = "Please set the correct <i>APP KEY</i> in the config for module";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        if (this.config.busStationCode === "") {
            wrapper.innerHTML = "Please set the <i>Station Code</i> in the config for module";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

         if (this.config.blinkingTime > this.config.warningTime) {
            wrapper.innerHTML = "Please set the <i>blinkingTime</i> value greater or equal than <i>warningTime</i> value for module";
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

        var maxEntries = this.iBus.lines.length;
        if (this.iBus.lines.length > this.config.maxEntries){
            var maxEntries = this.config.maxEntries;
        }

        if (this.iBus.lines.length > 0){
            for (index = 0; index < this.iBus.lines.length; ++index) {
                var row = document.createElement("tr");
                table.appendChild(row);

                var iconCell = document.createElement("td");
                iconCell.className = "symbol align-right";
                var iconSpan = document.createElement("span");
                iconSpan.className = "fa fa-fw fa-bus";
                iconCell.appendChild(iconSpan);
                row.appendChild(iconCell);

                var lineCell = document.createElement("td");
                lineCell.innerHTML = this.iBus.lines[index].lineCode;
                row.appendChild(lineCell);

                var stopCell = document.createElement("td");
                stopCell.className = "stopName";
                stopCell.innerHTML = this.iBus.busStopName;
                row.appendChild(stopCell);


                var secs = this.iBus.lines[index].tInS;
                var mins = this.iBus.lines[index].tInMin;

                var timeCell = document.createElement("td");
                timeCell.innerHTML = mins + " min" ;
                switch (true){
                    case (secs <= this.config.blinkingTime):
                        timeCell.className = "arriving blinking";
                        break;
                    case (secs < this.config.warningTime):
                        timeCell.className = "arriving";
                        break;
                }
                row.appendChild(timeCell);
            }
        }else{
            var row = document.createElement("tr");
            table.appendChild(row);

            var noBusCell = document.createElement("td");
            noBusCell.className = "dimmed light small";
            noBusCell.innerHTML = "No buses at this moment";
            row.appendChild(noBusCell);
        }

        return table;
    },

// ##################################################################################
// Override getHeader method
// ##################################################################################
    getHeader: function() {
        return "TMB iBus";
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
        }else if (notification === "DATA") {
            this.loaded = true;
            this.processResponse(payload);
            this.updateDom();
        }
    },
})