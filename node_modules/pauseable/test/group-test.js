var p            = require('..');
var assert       = require('assert');
var sinon        = require('sinon');
var EventEmitter = require('events').EventEmitter;


describe('Group', function() {
  var g = p.createGroup();
  var a = sinon.spy();
  var b = sinon.spy();
  var c = sinon.spy();
  
  var ee = g.add(new EventEmitter());
  ee.on('a', a);
  g.setInterval(function() {
    ee.emit('a');
  }, 100);
  g.setInterval(b, 100);
  g.setTimeout(c, 50);

  it('Has correct amount of timers', function() {
    assert.equal(g.timers().length, 4);
  });

  it('Correctly calls functions and listeners', function(done) {
    setTimeout(function() {
      assert.equal(a.callCount, 1);
      assert.equal(b.callCount, 1);
      assert.ok(c.called);
      done();
    }, 105);
  });

  describe('Pause for a given time', function() {
    it('Calls will be delayed', function(done) {
      g.pause(50);

      setTimeout(function() {
        assert.equal(a.callCount, 1);
        assert.equal(b.callCount, 1);
        done();
      }, 100);
    });

    describe('Clear', function() {
      it('EventEmitter will still be there', function(done) {
        g.clear();
        ee.emit('a');

        setTimeout(function() {
          assert.equal(g.timers().length, 1);
          assert.equal(a.callCount, 2);
          assert.equal(b.callCount, 1);
          assert.ok(c.called);
          done();
        }, 100);
      });
    });

  });
});
