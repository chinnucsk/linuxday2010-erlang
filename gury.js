/*
  gury.js - A jQuery inspired canvas utility library

  Copyright (c) 2010 Ryan Sandor Richards

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in
  all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  THE SOFTWARE.
*/

window.$g = window.Gury = (function() {
  /*
   * Utility functions
   */
  function isObject(v) { return typeof v == "object"; }
  function isFunction(v) { return typeof v == "function"; }
  function isString(v) { return typeof v == "string"; }
  function isObjectOrFunction(v) { return typeof v == "function" || typeof v == "object"; }
  
  function isDefined() { 
    for (var i = 0; i < arguments.length; i++) {
      if (typeof arguments[i] == "undefined" || arguments[i] === null) {
        return false;
      }
    }
    return arguments.length > 0;
  }
  
  /*
   * Internal exception handling
   */
  var _failWithException = true;
  
  function GuryException(msg) {
    if (_failWithException) {
      throw "Gury: " + msg;
    }
  }
  
  /*
   * These handle mappings from Canvas DOM elements to Gury instances
   * to allow for persistant states between calls to the module.
   */
  var guryId = 1;
  var canvasToGury = {};
  
  function nextGuryId() { 
    return "gury_id_" + (guryId++); 
  }
  
  function getGury(canvas) {
    if (!isString(canvas._gury_id) || !(canvasToGury[canvas._gury_id] instanceof Gury)) {
      return null;
    }
    return canvasToGury[canvas._gury_id];
  }
  
  function setGury(canvas, gury) {
    if (typeof canvas._gury_id == "string") {
      gury.id = canvas._gury_id;
    }
    else {
      gury.id = canvas._gury_id = nextGuryId();
    }

    return canvasToGury[gury.id] = gury;
  }
  
  /*
   * Hashtable Structure (for object -> object hashing)
   */
  var nextHash = 0;
  function Hashtable() {
    var table = this.table = {};
    
    function hash(object) {
      if (isString(object)) {
        return object;
      }
      if (!isDefined(object._gury_hash)) {
        object._gury_hash = nextHash++;
      }
      return object._gury_hash;
    }
    
    this.set = function(key, value) {
      var h = hash(key);
      table[h] = value;
    };
    
    this.has = function(key) {
      var h = hash(key);
      return isDefined(table[h]);
    };
    
    this.get = function(key) {
      var h = hash(key);
      return table[h];
    };
    
    this.remove = function(key) {
      var h = hask(key);
      delete table[h];
    };
    
    this.each = function(closure) {
      for (var h in table) {
        closure(table[h], h);
      }
      return this;
    };
  }
  
  /*
   * Dynamic Set Structure
   */ 
  function Set(ord) {
    var table = this.table = new Hashtable();
    var ordered = this.ordered = ord ? [] : false;
    
    this.has = function(object) {
      return table.has(object);
    };
    
    this.add = function(object) {
      if (table.has(object)) {
        return this;
      }
      if (ordered) {
        ordered.push(object);
      }
      table.set(object, object);
      return this;
    };

    this.remove = function(object) {
      if (!table.has(object)) {
        return null;
      }
      else if (ordered) {
        for (var k = 0; k < ordered.length; k++) {
          if (ordered[k] == object) {
            ordered.splice(k, 1);
            break;
          }
        }
      }
      table.remove(object);
      return object;
    };
    
    this.each = function(closure) {
      if (ordered) {
        for (var i = 0; i < ordered.length; i++) {
          closure(ordered[i], i);
        }
      }
      else {
        table.each(closure);
      }
      return this;
    };
  }
  
  /*
   * TagSpace Structure
   */
  function TagSpace() {
    this.name = name;
    this._children = {};
    this._objects = new Set();
  }
  TagSpace.prototype = (function() {
    var TAG_REGEX = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/;
    
    return {
      hasChild: function(name) {
        return isObject(this._children[name]);
      },

      addChild: function(name) {
        return this._children[name] = new TagSpace(name);
      },

      getChild: function(name) {
        return this._children[name];
      },

      getObjects: function() {
        return this._objects;
      },

      find: function(tag) {
        if (!tag.match(TAG_REGEX)) {
          return null;
        }

        var currentSpace = this;
        var tags = tag.split('.');
        var lastName = tags[tags.length - 1];

        for (var i = 0; i < tags.length; i++) {
          if (!currentSpace.hasChild(tags[i]))
            return null;
          currentSpace = currentSpace.getChild(tags[i]);
        }

        return currentSpace;
      },

      add: function(tag, object) {
        if (!tag.match(TagSpace.TAG_REGEX)) {
          return null;
        }

        var currentSpace = this;
        var tags = tag.split('.');
        var lastName = tags[tags.length - 1];

        for (var i = 0; i < tags.length; i++) {
          if (currentSpace.hasChild(tags[i])) {
            currentSpace = currentSpace.getChild(tags[i]);
          }
          else {
            currentSpace = currentSpace.addChild(tags[i]);
          }
        }

        currentSpace._objects.add(object);

        return object;
      },

      clearObjects: function() {
        this._objects = new Set();
      },

      _remove_object: function(o) {
        this._objects.remove(o);
        for (var k in this._children) {
          var child = this._children[k];
          child._remove_object(o);
        }
      },

      remove: function(q) {
        var removed = new Set();

        if (isString(q)) {
          var space = this.find(q);
          if (!space) {
            return removed;
          }
          removed = space.getObjects();
          space.clearObjects();
        }
        else {
          this._remove_object(q);
          removed.add(q);
        }

        return removed;
      }
    };
  })();
  
  /*
   * Core Gury Class
   */
  function Gury(canvas) {
    if (canvas == null) {
      canvas = document.createElement('canvas');
    }
    
    // Check for an existing mapping from the canvas to a Gury instance
    if (getGury(canvas)) {
      return getGury(canvas);
    }
    
    // Otherwise create a new instance
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    this._objects = new Set(true);
    this._tags = new TagSpace('__global');
    
    this._paused = false;
    this._loop_interval = null;
  
    Events.init(this);
    
    return setGury(canvas, this);
  }
  
  Gury.prototype.place = function(node) {
    if (typeof node == "string" && typeof $ == "function") {
      $(node).append(this.canvas);
    }
    else if (typeof node == "object" && typeof node.addChild == "function") {
      node.addChild(this.canvas);
    }
    else {
      GuryException("place() - Unable to place canvas tag (is jQuery loaded?)");
    }
    return this;
  };
  
  /*
   * Canvas style methods
   */
  Gury.prototype.size = function(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    return this;
  };
  
  Gury.prototype.background = function(bg) {
    this.canvas.style.background = bg;
    return this;
  };
  
  /*
   * Objects and Rendering
   */
  
  function _annotate_object(object) {
    if (isDefined(object._gury)) {
      return;
    }
    object._gury = { visible: true, paused: false };
  }
  
  Gury.prototype.add = function() {
    var tag = null, obj;
    
    if (arguments.length < 1) {
      return this;
    }
    else if (arguments.length < 2) {
      obj = arguments[0];
      if (!isObjectOrFunction(obj)) {
        return this;
      }
    }
    else {
      tag = arguments[0];
      obj = arguments[1];
      if (!isString(name) || !isObjectOrFunction(obj)) {
        return this;
      }
    }

    // Add the object to the global tag space (if a tag was provided)
    if (tag != null) {
      this._tags.add(tag, obj);
    }
    
    // We can apply new tags using add, but we don't want to keep track of the
    // object twice in the master rendering list...
    if (this._objects.has(obj)) {
      return this;
    }
    
    // Annotate the object with gury specific members
    _annotate_object(obj);
    
    // Add to the rendering list
    this._objects.add(obj);
    
    return this;
  };
  
  Gury.prototype.remove = function(object) {
    if (isDefined(object)) {
      var gury = this;
      var removed = this._tags.remove(object);
      removed.each(function(r) {
        gury._objects.remove(r);
      });
    }
    return this;
  };
  
  Gury.prototype.clear = function() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    return this;
  };
  
  Gury.prototype.update = function() {
    var gury = this;
    gury._objects.each(function(ob) {
      if (isDefined(ob.update) && !ob._gury.paused) {
        ob.update(gury);
      }
    });
    return this;
  };
  
  Gury.prototype.draw = function() {
    this.clear();
    
    var gury = this;
    gury._objects.each(function(ob) {
      if (!ob._gury.visible) {
        return;
      }

      if (typeof ob == "function") {
        ob.call(gury, gury.ctx);
      }
      else if (typeof ob == "object" && typeof ob.draw != "undefined") {
        ob.draw(gury.ctx, gury.canvas);
      }
    });
    
    return this;
  };
  
  /*
   * Animation Controls
   */
  
  Gury.prototype.play = function(interval) {
    // Ignore multiple play attempts
    if (this._loop_interval != null) {
      return this;
    }
  
    // Immediately render the scene
    this.draw();
    
    // Start the rendering / update loop  
    var gury = this;
    this._loop_interval = setInterval(function() {
      if (!gury._paused) {
        gury.update().draw();
      }
    }, interval);
    return this;
  };
  
  
  Gury.prototype.pause = function() {
    if (arguments.length > 0) {
      for (var i = 0; i < arguments.length; i++) {
        var arg = arguments[i];
        if (isString(arg)) {
          this.each(arg, function(ob) {
            ob._gury.paused = !ob._gury.paused;
          });
        }
        else if (isDefined(arg._gury)) {
          arg._gury.paused = !arg._gury.paused;
        }
      }
      return this;
    }
    else {
      this._paused = !this._paused;
      return this;
    }
  };
  
  Gury.prototype.stop = function() {
    if (this._loop_interval != null) {
      clearInterval(this._loop_interval);
      this._paused = false;
    }
    return this;
  };
  
  /*
   * Object / Tag Methods
   */
  Gury.prototype.each = function() {
    var tag, closure;
    
    if (arguments.length < 2 && isFunction(arguments[0])) {
      closure = arguments[0];
      this._objects.each(closure);
    }
    else if (isString(arguments[0]) && isFunction(arguments[1])) {
      tag = arguments[0];
      closure = arguments[1];
      var space = this._tags.find(tag);
      if (space) {
        space.getObjects().each(closure);
      }
    }
    else if (isFunction(arguments[0])) {
      closure = arguments[0];
      this._objects.each(closure);
    }
    else if (isFunction(arguments[1])) {
      closure = arguments[1];
      this._objects.each(closure);
    }
    
    return this;
  };
   
  Gury.prototype.hide = function(tag) {
    return this.each(tag, function(obj, index) {
      obj._gury.visible = false;
    });
  };
  
  Gury.prototype.show = function(tag) {
    return this.each(tag, function(obj, index) {
      obj._gury.visible = true;
    });
  };
  
  Gury.prototype.toggle = function(tag) {
    return this.each(tag, function(obj, index) {
      obj._gury.visible = !obj._gury.visible;
    });
  };
  
  /* 
   * Object Events
   */
  
  // TODO Document event system fully 
  var Events = (function() {
    function inRange(x, y, object) {
      var q = x - object.x;
      var r = y - object.y;

      if (isDefined(object.size)) {
        return q >= 0 && q < object.size && r >= 0 && r < object.size;
      }
      else if (isDefined(object.width, object.height)) {
        return q >= 0 && q < object.width && r >= 0 && r < object.height;
      }

      return false;
    }
     
    // Encapsulates an object in a set or finds a set of objects matching a tag
    function objects(gury, query) {
      var objects = new Set();
      if (isString(query)) {
        objects = gury._tags.find(query).getObjects();
      }
      else if (isDefined(query) && gury._objects.has(query)) {
        objects.add(query);
      }
      return objects;
    }
    
    // Adapted from: http://www.quirksmode.org/js/findpos.html
    function getOffset(object) {
      var left = 0, top = 0;
      if (object.offsetParent) {
        while (object) {
          left += object.offsetLeft;
          top += object.offsetTop;
          object = object.offsetParent;
        }
      }
      return {left:left, top:top};
    }
    
    function triggerObjectsAt(gury, e, event) {
      if (isDefined(gury._events[event])) {
        var offset = getOffset(gury.canvas);
        var x = e.pageX - offset.left;
        var y = e.pageY - offset.top;

        // TODO Replace with spatial indexing lookup
        gury._events[event].each(function(entry) {
          if (inRange(x, y, entry.target)) {
            gury.trigger(event, entry.target, e);
          }
        });
      }
    }
    
    /*
     * Determines if an event can be bound to an object.
     * Specifically, for mouse events, this determines if
     * the object contains the required members in order
     * to work with the event system and throws an exception
     * if the object does not.
     */
    function canBind(object, event) {
      // Check for mouse event requirements
      if (event == 'click' || event.match(/^mouse.+$/)) {
        if (!isDefined(object.x, object.y) || !(isDefined(object.size) || isDefined(object.width, object.height))) {
          GuryException('bind() - Cannot bind mouse event to object without position and dimensions');
        }
      }
      return true;
    }
    
    // TODO Document me
    Gury.prototype.bind = function(object, event, closure) {
      if (isDefined(object, event, closure) && canBind(object, event)) {
        var gury = this;
        var events = gury._events;

        objects(gury, object).each(function(ob) {
          if (!isDefined(events[event])) {
            events[event] = new Hashtable();
          }
          if (!events[event].has(ob)) {
            events[event].set(ob, {
              target: ob,
              handlers: []
            });
          }
          events[event].get(ob).handlers.push(closure);
        });
      }
      return this;
    };

    // TODO Document me
    Gury.prototype.unbind = function(object, event, closure) {
      if (isDefined(object, event)) {
        var gury = this;
        var events = gury._events;

        objects(gury, object).each(function(ob) {
          if (!isDefined(events[event])) {
            return;
          }
          if (!events[event].has(ob)) {
            return;
          }

          if (isDefined(closure)) {
            var handlers = events[event].get(ob).handlers;
            for (var i = 0; i < handlers.length; i++) {
              if (handlers[i] == closure) {
                handlers.splice(i, 1);
                break;
              }
            }
          }
          else {
            events[event].remove(ob);
          }
        });
      }
      return this;
    };

    // TODO Document me
    Gury.prototype.trigger = function(event, object, e) {
      if (isDefined(event, this._events[event], object)) {
        if (this._events[event].has(object)) {
          var handlers = this._events[event].get(object).handlers;
          for (var i = 0; i < handlers.length; i++) {
            handlers[i].call(object, e);
          }
        }
      }
      return this;
    };
    
    // Creates specific event methods for the Gury object itself
    function eventFunction(event) {
      return function(object, closure) {
        if (isDefined(object)) {
          if (isDefined(closure)) {
            this.bind(object, event, closure);
          }
          else {
            this.trigger(object, event);
          }
        }
        return this;
      };
    }
    
    // TODO Document me
    Gury.prototype.click = eventFunction('click');

    // TODO Document me
    Gury.prototype.mousedown = eventFunction('mousedown');

    // TODO Document me
    Gury.prototype.mouseup = eventFunction('mouseup');

    // TODO Document me
    Gury.prototype.mousemove = eventFunction('mousemove');
    
    return {
      init: function(gury) {
        gury._events = {};
        var canvas = gury.canvas;

        // Mouse Events
        canvas.onclick = function(e) {
          triggerObjectsAt(gury, e, 'click');
        };
        
        canvas.onmousedown = function(e) {
          triggerObjectsAt(gury, e, 'mousedown');
        };
        
        canvas.onmouseup = function(e) {
          triggerObjectsAt(gury, e, 'mouseup');
        };
        
        canvas.onmousemove = function(e) {
          triggerObjectsAt(gury, e, 'mousemove');
        };
      }
    };
  })();
  
  /*
   * Public interface
   */
  function GuryInterface(id) {
    return new Gury(id ? document.getElementById(id) : null);
  }
  
  GuryInterface.failWithException = function(b) {
    if (!b) {
      return _failWithException;
    }
    return _failWithException = b ? true : false;
  };
  
  return GuryInterface;
})();

// "There's a star man waiting in the sky. He'd like to come and meet us but 
// he think's he'll blow our minds."