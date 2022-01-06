exports.pause = function(ee, ms) {
  if (ee.paused) return;
  ee.paused = true;
  if (typeof ee._bufferedEvents === 'undefined') {
    ee._bufferedEvents = [];
  }
  
  ee._oldEmit = ee.emit;
  ee.emit = function() {
    ee._bufferedEvents.push(arguments);
  };

  if (ms) {
    setTimeout(function() { exports.resume(ee); }, ms);
  }
};

exports.resume = function(ee, ms) {
  if (!ee.paused) return;
  ee.paused = false;

  ee.emit = ee._oldEmit;
  for (var i = ee._bufferedEvents.length - 1; i >= 0; i--) {
    ee.emit.apply(ee, ee._bufferedEvents.pop());
  }

  if (ms) {
    setTimeout(function() { exports.pause(ee); }, ms);
  }
};


exports.createGroup = function() {
  var timers = [];
  var paused = false;
  var done = false;

  return {
    add: function(id) {
      if (typeof id.emit === 'undefined') {
        id.onDone(function() {
          timers.splice(timers.indexOf(id), 1);
          if (timers.length === 0) {
            done = true;
          }
        });
      }

      timers.push(id);
      return id;
    },

    setTimeout: function(fn, ms) {
      return this.add(exports.setTimeout(fn, ms));
    },

    setInterval: function(fn, ms) {
      return this.add(exports.setInterval(fn, ms));
    },

    pause: function(resumeIn) {
      for (var i = 0; i < timers.length; i++) {
        var id = timers[i];
        if (typeof id.emit === 'function') {
          exports.pause(id, resumeIn);
        } else {
          id.pause(resumeIn);
        }
      }
      paused = true;
    },

    resume: function(pauseIn) {
      for (var i = 0; i < timers.length; i++) {
        var id = timers[i];
        if (typeof id.emit === 'function') {
          exports.resume(id, pauseIn);
        } else {
          id.resume(pauseIn);
        }
      }
      paused = false;
    },

    clear: function() {
      for (var i = timers.length - 1; i >= 0; i--) {
        if (typeof timers[i].clear === 'function') {
          timers[i].clear();
        }
      }
    },

    isPaused: function() {
      return paused;
    },

    isDone: function() {
      return done;
    },
  
    timers: function() {
      return timers;
    }
  };
};

var timer = function(type, clear, fn, ms) {
  // allow fn and ms arguments to be switchabale
  // let the user decide the syntax
  if (typeof fn !== 'function') {
    var tmp = fn;
    fn = ms;
    ms = tmp;
  }

  var done = false;
  var countdownStart = Date.now();
  var nextTime = ms;
  var paused;
  var finished;
  var resumed;

  var wrapper = function() {
    countdownStart = Date.now();
    nextTime = ms;
    fn.apply();
    if (type === setTimeout) {
      done = true;
      if (typeof finished === 'function') {
        finished.apply();
      }
    } else if (resumed) {
      resumed = false;
      id = setInterval(wrapper, ms);
    }
  };

  var id = type(wrapper, ms);

  return {
    pause: function(resumeIn) {
      if (done || paused) return;
      clear(id);
      paused = true;
      if (resumeIn) {
        setTimeout(this.resume, resumeIn);
      }
      return nextTime -= Date.now() - countdownStart;
    },

    resume: function(pauseIn) {
      if (done || !paused) return;
      paused = false;
      resumed = true;
      countdownStart = Date.now();
      if (pauseIn) {
        setTimeout(this.pause, pauseIn);
      }

      // calling setTimeout here and not type because
      // calling setInterval with the remaining time will continue to
      // call setInterval with that lessened time
      id = setTimeout(wrapper, nextTime);
    },

    next: function() {
      return nextTime - (paused ? 0 : Date.now() - countdownStart);
    },

    clear: function() {
      if (done) return;
      if (resumed) {
        clearTimeout(id);
      } else {
        clear(id);
      }
      done = true;
      if (typeof finished === 'function') {
        finished.apply();
      }
    },

    isPaused: function() {
      return paused;
    },

    isDone: function() {
      return done;
    },

    onDone: function(fn) {
      finished = fn;
    }
  };
};

exports.setTimeout = function(fn, ms) {
  return timer(setTimeout, clearTimeout, fn, ms);
};

exports.setInterval = function(fn, ms) {
  return timer(setInterval, clearInterval, fn, ms);
};
