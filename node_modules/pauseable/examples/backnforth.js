var pauseable = require('../.');
var EventEmitter = require('events').EventEmitter;


// create a group
var g = pauseable.createGroup();

// make and add emitters to group
var ee1 = g.add(new EventEmitter());
var ee2 = g.add(new EventEmitter());

ee1.on('forth', function() {
  // pause entire group (that means ee1 and ee2) for 500 ms
  // timeout is out of the group by the time this executes
  g.pause(500);
  console.log('forth');
  ee2.emit('back');
});

ee2.on('back', function() {
  console.log('back');
  ee1.emit('forth');
});

g.setTimeout(function() {
  ee2.emit('back', 'poop');
}, 1000);
