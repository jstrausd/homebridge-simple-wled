var extend = require("extend"),
  debug = require("debug")("polling-to-event"),
  util = require("util"),
  EventEmitter = require("events").EventEmitter,
  pauseable = require("pauseable"),
  equal = require("deep-equal");

module.exports = pollingtoevent;

function pollingtoevent(func, options) {
  if (!(this instanceof pollingtoevent)) {
    return new pollingtoevent(func, options);
  }

  var _this = this,
    firstpoll = true,
    lastParams = undefined,
    defaults = {
      interval: 1000,
      eventName: "poll",
      longpollEventName: "longpoll",
      longpolling: false,
    };

  // Inherit from EventEmitter
  EventEmitter.call(this);

  options = extend(defaults, options);

  function done(err) {
    if (err) {
      debug("Emitting `error`: %s.", err);
      return _this.emit("error", err);
    }
    // Do nothing if the user paused the interval.
    // Otherwise the user calls pause() and a callback from previous intervals are called
    // after the user's wish to pause the event emission.
    //
    // I check if _this.interval is defined here because on the first poll
    // the interval has not been set yet. 
    if (_this.interval && _this.interval.isPaused()) {
      return;
    }
    // Save the event name as first item in the parameters array
    // that will be used wit _this.emit.apply()
    var params = [];
    for (var i = 1; i < arguments.length; i++) {
      params.push(arguments[i]);
    }
    debug("Emitting '%s'.", options.eventName);
    // Emit the interval event after every polling
    _this.emit.apply(_this, [options.eventName].concat(params));

    // If this is the first call or long polling is set, compare
    // the last value polled with the last one
    if (firstpoll || options.longpolling) {
      debug("Comparing last polled parameters");
      //debug("%j, %j", params, lastParams);
      if (!equal(params, lastParams)) {
        debug("Last polled data and previous poll data are not equal.");
        debug("Emitting '%s'.", options.longpollEventName);
        // Emit the longpoll event after longpolling
        _this.emit.apply(_this, [options.longpollEventName].concat(params))
      } else {
        debug("Last polled data and previous poll data are equal.");
      }
      lastParams = params;
    }
    // Set this to false when the function ends
    firstpoll = false;
  }

  // Call the function right away
  // inside a timeout with 0 in order for the user to be able
  // to set handlers for the first poll intuitively after creating a poller
  setTimeout(function() {
    func(done);
    _this.interval = pauseable.setInterval(function() {
      // Call the user's function only if he has not paused the interval.
      // Otherwise the user calls pause() and a callback from previous intervals are called
      // after the user's wish to pause the event emission.
      if (!_this.interval.isPaused()) {
        func(done);
      }
    }, options.interval);
  }, 0);
  // Set the interval


}

// Inherit from EventEmitter
util.inherits(pollingtoevent, EventEmitter);

pollingtoevent.prototype.pause = function() {
  debug("Pausing interval");
  this.interval.pause();
}

pollingtoevent.prototype.resume = function() {
  debug("Resuming interval");
  this.interval.resume();
}

pollingtoevent.prototype.clear = function() {
  debug("Clearing interval");
  this.interval.clear();
}
