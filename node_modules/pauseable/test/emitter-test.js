var p            = require('..');
var assert       = require('assert');
var sinon        = require('sinon');
var EventEmitter = require('events').EventEmitter;


describe('Event Emitter', function() {
  var ee = new EventEmitter();
  var foo = sinon.spy();
  var bar = sinon.spy();

  ee.on('foo', foo);
  ee.on('bar', bar);

  describe('Emit', function() {
    it('Emits correct event with arguments', function() {
      ee.emit('foo', 1, 2);
      ee.emit('bar', 'baz');

      assert.equal(foo.callCount, 1);
      assert.ok(foo.calledWith(1, 2));
      assert.equal(bar.callCount, 1);
      assert.ok(bar.calledWith('baz'));
    });

    describe('Pause and emit events', function() {
      it('Listeners do not get called', function() {
        p.pause(ee);
        ee.emit('foo', 'a', 'b');
        ee.emit('bar', true);

        assert.equal(foo.callCount, 1);
        assert.ok(foo.calledWith(1, 2));
        assert.equal(bar.callCount, 1);
        assert.ok(bar.calledWith('baz'));
      });

      describe('Resume and try emitting again', function() {
        it('Buffered events call listeners', function() {
          p.resume(ee);

          assert.equal(foo.callCount, 2);
          assert.ok(foo.calledWith('a', 'b'));
          assert.equal(bar.callCount, 2);
          assert.ok(bar.calledWith(true));
        });

        it('Events emitted call listeners immediately', function() {
          ee.emit('foo', 'mom', 'dad');
          ee.emit('bar', 'hello');

          assert.equal(foo.callCount, 3);
          assert.ok(foo.calledWith('mom', 'dad'));
          assert.equal(bar.callCount, 3);
          assert.ok(bar.calledWith('hello'));
        });
      });

    });
  });
});
