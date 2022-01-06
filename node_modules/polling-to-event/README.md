# node-polling-to-event
Receive events with EventEmitter from a polling function ran on an interval


Technically speaking [polling](http://en.wikipedia.org/wiki/Polling_%28computer_science%29) is defined as status check from an external device,
but with **node-polling-to-event** you can expect events from your own function that polls whatever resource you want that implies either a synchronous or an asynchronous operation.

## Installation

    $ npm install polling-to-event

## Usage

    var pollingtoevent = require("polling-to-event");

    var emitter = pollingtoevent(function(done) {
      // your async stuff
      // ....
      done(null, arg1, arg2, ..., argN);
    });

    emitter.on("poll", function(data) {
      console.log(data);
    });

    emitter.on("err", function(err) {
      console.log(err);
    });    


## Example

    var pollingtoevent = require("polling-to-event"),
      request = require("request");

    var url = "https://raw.githubusercontent.com/mozilla/contribute.json/master/schema.json";

    emitter = pollingtoevent(function(done) {
      request.get(url, function(err, req, data) {
        done(err, data);
      });
    });

    emitter.on("poll", function(data) {
      console.log("Event emitted at %s, with data %j", Date.now(), data);
    });

    emitter.on("error", function(err, data) {
      console.log("Emitter errored: %s. with data %j", err, data);
    });

**Long polling**

  If you set the option `longpolling:true` the emitter will emit an *longpoll* event when
  the polled data differs.

    emitter = pollingtoevent(function(done) {
      request.get(url, function(err, req, data) {
        done(err, data);
      });
    }, {
      longpolling:true
    });

    emitter.on("longpoll", function(data) {
      console.log("longpoll emitted at %s, with data %j", Date.now(), data);
    });

## API

#### pollingtoevent(pollingfunction, options)

It creates an event emitter that emits the polled data on an interval.

Your polling function will be called right away, and at the end of every interval.

**Arguments**
* `pollingfunction(done)` - **Required**. The function you want to be called at an interval. When called, this function will receive a `done` parameter as its last argument.
  * `done(error, arg1, arg2, ... argN) ` - You must call **done()**  inside your function when your function finish its work.
    * `error` - **Required**. Call `done()` with `null` as its first argument if there was no error. Call it with an [error object](https://www.joyent.com/developers/node/design/errors) instance as first argument if you wish the emitter to emit an `error` event..  
    * `arg1, arg2, ... argN` - The data fetched by your polling function. Your `pollingfunction` passes this arguments to `done()` in order to be emitted by the emitter. Any number of arguments will do.  
* `options` - **Optional**. An `Object` having any of the following keys:
  * `interval` - Interval in milliseconds. **Default**: 1000.
  * `longpolling` - Set to true if you want to be notified when data from the last poll differ from previous polled data. The data taken for comparison is every argument your `pollingfunction` passes to `done()`. The comparison is made with [deep-equal](https://www.npmjs.com/package/deep-equal). **Default:** `false`.
  * `eventName` - The event name to emit on each successful call to `done()`. **Default**: `"poll"`.
  * `longpollEventName` - The event name to emit when last polled data differs from previous polling data. **Default**: `"longpoll"`.

**Returns**

Returns an [EventEmitter](http://nodejs.org/api/events.html#events_class_events_eventemitter) instance with some extra methods. See [Methods](#emitter-methods).

#### Emitter events

* `poll` - Emitted when an interval has completed and the `done()` function was called with no errors. *You can also customize this event's name using the option `eventName`*. **Parameters**: Your listener gets the parameter passed to `done()` with exception of the error parameter which is the first parameter `done()` uses.
* `error` - Emitted when `done()` was called with an error object. It emits the data polled by your polling function.  **Parameters**. An error object.
* `longpoll` - Emitted when option `longpolling` is true and the last polled data differs from the previous polling data. **Parameters**: Your listener gets the parameter received by `done()` with exception of the error parameter which is the first parameter `done()` uses. *You can also customize this event's name using the option `longpollEventName`*

#### Emitter methods

##### pause()

Pauses the interval.

##### resume()

Resumes the interval if it has been paused

##### clear()

Clears the interval timer


## TODO

* Add a default behaviour to poll URLs via a `GET` request if an URL string is passed as argument instead of a function.

## License 

The MIT License (MIT)

Copyright (c) 2015 osk &lt;oskosk@gmail.com&gt;

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
