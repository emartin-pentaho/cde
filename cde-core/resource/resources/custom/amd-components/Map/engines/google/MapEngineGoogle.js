/*!
 * Copyright 2002 - 2015 Webdetails, a Pentaho company. All rights reserved.
 *
 * This software was developed by Webdetails and is provided under the terms
 * of the Mozilla Public License, Version 2.0, or any later version. You may not use
 * this file except in compliance with the license. If you need a copy of the license,
 * please go to http://mozilla.org/MPL/2.0/. The Initial Developer is Webdetails.
 *
 * Software distributed under the Mozilla Public License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied. Please refer to
 * the license for the specific language governing your rights and limitations.
 */

define([
  "cdf/lib/jquery",
  "amd!cdf/lib/underscore",
  "../MapEngine",
  "./MapComponentAsyncLoader",
  "../../model/MapModel",
  "css!./styleGoogle"
], function ($, _, MapEngine, MapComponentAsyncLoader, MapModel) {

  function OurMapOverlay(startPoint, width, height, htmlContent, popupContentDiv, map, borderColor) {

    // Now initialize all properties.
    this.startPoint_ = startPoint;
    this.width_ = width;
    this.height_ = height;
    this.map_ = map;
    this.htmlContent_ = htmlContent;
    this.popupContentDiv_ = popupContentDiv;
    this.borderColor_ = borderColor;

    this.div_ = null;

    // Explicitly call setMap() on this overlay
    this.setMap(map);
  }

  return MapEngine.extend({
    map: undefined,
    centered: false,
    boxStyle: {
      fillOpacity: 0.15,
      strokeWeight: 0.9
    },
    overlays: [],
    API_KEY: false,
    selectedFeature: undefined,

    constructor: function (options) {
      this.base();
      $.extend(this, options);
      this.controls = {}; // map controls
      this.controls.listenersHandle = {};

    },

    init: function () {
      return $.when(MapComponentAsyncLoader("3", this.API_KEY)).then(
        function (status) {
          OurMapOverlay.prototype = new google.maps.OverlayView();
          OurMapOverlay.prototype.onAdd = function () {
            // Note: an overlay"s receipt of onAdd() indicates that
            // the map"s panes are now available for attaching
            // the overlay to the map via the DOM.

            // Create the DIV and set some basic attributes.
            var div = document.createElement("DIV");
            div.id = "MapOverlay";
            div.style.position = "absolute";

            if (this.borderColor_) {
              div.style.border = "3px solid " + this.borderColor_;
            } else {
              div.style.border = "none";
            }


            var me = this;
            var closeDiv = $('<div id="MapOverlay_close" class="olPopupCloseBox" style="position: absolute;"></div>');
            closeDiv.click(function () {
              me.setMap(null);
            });
            $(div).append(closeDiv);

            if (this.popupContentDiv_ && this.popupContentDiv_.length > 0) {
              $(div).append($("#" + this.popupContentDiv_));
            } else {
              div.innerHTML = this.htmlContent_;
            }


            //Using implementation described on http://web.archive.org/web/20100522001851/http://code.google.com/apis/maps/documentation/javascript/overlays.html
            // Set the overlay"s div_ property to this DIV
            this.div_ = div;

            // We add an overlay to a map via one of the map"s panes.
            // We"ll add this overlay to the overlayImage pane.
            var panes = this.getPanes();
            panes.overlayLayer.appendChild(div);
          };


          //Using implementation described on http://web.archive.org/web/20100522001851/http://code.google.com/apis/maps/documentation/javascript/overlays.html
          OurMapOverlay.prototype.draw = function () {
            // Size and position the overlay. We use a southwest and northeast
            // position of the overlay to peg it to the correct position and size.
            // We need to retrieve the projection from this overlay to do this.
            var overlayProjection = this.getProjection();

            // Retrieve the southwest and northeast coordinates of this overlay
            // in latlngs and convert them to pixels coordinates.
            // We"ll use these coordinates to resize the DIV.
            var sp = overlayProjection.fromLatLngToDivPixel(this.startPoint_);

            // Resize the DIV to fit the indicated dimensions.
            var div = this.div_;
            div.style.left = sp.x + "px";
            div.style.top = (sp.y + 30) + "px";
            div.style.width = this.width_ + "px";
            div.style.height = this.height_ + "px";
          };


          OurMapOverlay.prototype.onRemove = function () {
            if (this.popupContentDiv_) {
              $("#" + this.popupContentDiv_).append($(this.div_));
              $(this.div_).detach();
            }
            this.div_.style.display = "none";
            this.div_.parentNode.removeChild(this.div_);
            this.div_ = null;
          };

        });
    },

    wrapEvent: function (event, featureType) {
      var me = this;
      var modelItem = event.feature.getProperty('model');
      return $.extend(this._wrapEvent(modelItem), {
        latitude: event.latLng.lat(),
        longitude: event.latLng.lng(),
        _popup: function (html, options) {
          var opt = $.extend({
            width: 100,
            height: 100
          }, options || {});
          me.showPopup(null, feature, opt.height, opt.width, html, null, null);
        },
        feature: event.feature,
        mapEngineType: "google3",
        draw: function (style) {
          // this function is currently called by the shape callbacks
          var validStyle = me.toNativeStyle(style);
          feature.setOptions(validStyle);
          feature.setVisible(false);
          feature.setVisible(_.has(style, "visible") ? !!style.visible : true);
        },
        _setSelectedStyle: function (style) {
          feature.selStyle = style;
        },
        _getSelectedStyle: function () {
          return feature.selStyle;
        },
        raw: event
      });
    },


    toNativeStyle: function (foreignStyle, modelItem) {
      var conversionTable = {
        // SVG standard attributes : OpenLayers2 attributes
        "fill": "fillColor",
        "fill-opacity": "fillOpacity",
        "stroke": "strokeColor",
        "stroke-opacity": "strokeOpacity",
        "stroke-width": "strokeWeight",
        "r": "scale",
        "z-index": "zIndex",
        //Backwards compatibility
        "fillColor": "fillColor",
        "fillOpacity": "fillOpacity",
        "strokeColor": "strokeColor",
        "strokeOpacity": "strokeOpacity",
        "strokeWidth": "strokeWeight",
        "zIndex": "zIndex"
      };
      var validStyle = {};
      _.each(foreignStyle, function (value, key) {
        var nativeKey = conversionTable[key];
        if (nativeKey) {
          validStyle[nativeKey] = value;
        } else {
          switch (key) {
            case "visible":
              validStyle["display"] = value ? true : "none";
              break;
            case "icon-url":
              validStyle["icon"] = value;
              validStyle["size"] = new google.maps.Size(foreignStyle["width"], foreignStyle["height"]);
              break;
            case "symbol":
              var symbols = {
                circle: google.maps.SymbolPath.CIRCLE
              };
              var symbol = symbols[value];
              validStyle["path"] = _.isUndefined(symbol) ? value : symbol;

              break;
            default:
              // be permissive about the validation
              validStyle[key] = value;
              break
          }
        }
      });

      if (modelItem && modelItem.getFeatureType() === "marker") {
        if (!validStyle.icon) {
          validStyle = {
            icon: validStyle
          };
        }
      }
      //console.log("foreign vs valid:", foreignStyle, validStyle);
      return validStyle;
    },

    /*----------------------------*/

    updateItem: function (modelItem) {
      var id = modelItem.get("id");
      var feature = this.map.data.getFeatureById(id);
      var style = this.toNativeStyle(modelItem.getStyle(), modelItem);
      this.map.data.overrideStyle(feature, style);
    },

    renderMap: function (target) {
      var mapOptions = {
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        scrollwheel: this.options.controls.enableZoomOnMouseWheel === true,
        keyboardShortcuts: this.options.controls.enableKeyboardNavigation === true,
        disableDefaultUI: true
      };

      // Add base map
      this.map = new google.maps.Map(target, mapOptions);

      this.addLayers();
      this.addControls();
      this.registerViewportEvents();

    },

    zoomExtends: function () {
      var latlngbounds = new google.maps.LatLngBounds();
      this.map.data.forEach(function (feature) {
        if (feature.getGeometry().getType() == "Point") {
          latlngbounds.extend(feature.getGeometry().get());
        }
      });

      if (!latlngbounds.isEmpty()) {
        this.map.setCenter(latlngbounds.getCenter());
        this.map.fitBounds(latlngbounds);
        return true;
      } else {
        return false;
      }
    },

    renderItem: function (modelItem) {
      if (!modelItem) {
        return;
      }
      var geoJSON = modelItem.get("geoJSON");
      var me = this;
      $.when(geoJSON).then(function (feature) {
        if (!feature) {
          return;
        }

        //set id for the feature
        $.extend(true, feature, {
          properties: {
            id: modelItem.get("id"),
            model: modelItem
          }
        });

        var importedFeatures = me.map.data.addGeoJson(feature, {
          idPropertyName: "id"
        });
        _.each(importedFeatures, function (f) {
          var style = me.toNativeStyle(modelItem.getStyle(), modelItem);
          me.map.data.overrideStyle(f, style);
        });
      });

    },

    addControls: function () {

      this._addControlHover();
      //this._addControlClick();
      this._addControlZoomBox();
      this._addControlBoxSelector();
      this._addLimitZoomLimits();
    },


    _removeListeners: function () {
      _.each(this.controls.listenersHandle, function (h) {
        h.remove();
      });
    },

    _addControlHover: function () {
      var me = this;
      this.map.data.addListener("mouseover", function (e) {
        setStyle(e, "hover");
        var featureType = e.feature.getProperty("model").getFeatureType();
        me.trigger(featureType + ":mouseover", me.wrapEvent(e));
      });

      this.map.data.addListener("mouseout", function (e) {
        setStyle(e, "normal");
        var featureType = e.feature.getProperty("model").getFeatureType();
        me.trigger(featureType + ":mouseout", me.wrapEvent(e));
      });

      function setStyle(event, action) {
        var modelItem = event.feature.getProperty("model");
        modelItem.setHover(action === "hover");
      }

    },

    _addControlZoomBox: function () {
      this.controls.zoomBox = {
        bounds: null,
        gribBoundingBox: null,
        mouseIsDown: false
      };
    },

    _addControlBoxSelector: function () {
      this.controls.boxSelector = {
        bounds: null,
        gribBoundingBox: null,
        mouseIsDown: false
      };
    },

    _addControlClick: function () {
      var me = this;
      this.map.data.addListener("click", function (e) {
        var featureType = e.feature.getProperty("model").getFeatureType();
        me.trigger(featureType + ":click", me.wrapEvent(e));
        me.trigger("engine:selection:complete");
      });
    },

    _addLimitZoomLimits: function () {
      var minZoom = _.isFinite(this.options.viewport.zoomLevel.min) ? this.options.viewport.zoomLevel.min : 0;
      var maxZoom = _.isFinite(this.options.viewport.zoomLevel.max) ? this.options.viewport.zoomLevel.max : null;
      var me = this;

      // Limit the zoom level
      google.maps.event.addListener(this.map, "zoom_changed", function () {
        if (me.map.getZoom() < minZoom) {
          me.map.setZoom(minZoom);
        } else if ((!_.isNull(maxZoom)) && (me.map.getZoom() > maxZoom)) {
          me.map.setZoom(maxZoom); // if is NULL, max is the limit of the map
        }
      });
    },

    zoomIn: function () {
      this.map.setZoom(this.map.getZoom() + 1);
    },

    zoomOut: function () {
      this.map.setZoom(this.map.getZoom() - 1);
    },

    setPanningMode: function () {
      this._removeListeners();
      var me = this;
      var listeners = this.controls.listenersHandle;
      listeners.click = this._toggleOnClick();
      listeners.clearOnClick = this._clearOnClick();
    },

    setZoomBoxMode: function () {
      this._removeListeners();
      var me = this;
      var control = this.controls.zoomBox;
      var listeners = this.controls.listenersHandle;

      listeners.click = this._toggleOnClick();

      var onMouseDown = function (e) {
        if (me.model.isZoomBoxMode()) {
          me._beginBox(control, e);
        }
      };
      listeners.mousedown = google.maps.event.addListener(this.map, "mousedown", onMouseDown);
      listeners.mousedownData = this.map.data.addListener("mousedown", onMouseDown);

      var onMouseMove = function (e) {
        if (me.model.isZoomBoxMode() && control.mouseIsDown) {
          me._onBoxResize(control, e);
        }
      };
      listeners.mousemove = google.maps.event.addListener(this.map, "mousemove", onMouseMove);
      listeners.mousemoveData = this.map.data.addListener("mousemove", onMouseMove);

      var onMouseUp = this._endBox(control,
        function () {
          return me.model.isZoomBoxMode()
        },
        function (bounds) {
          me.map.fitBounds(bounds);
        }
      );
      listeners.mouseup = google.maps.event.addListener(this.map, "mouseup", onMouseUp);
      listeners.mouseupData = this.map.data.addListener("mouseup", onMouseUp);
    },


    setSelectionMode: function () {
      this._removeListeners();
      var me = this;
      var control = me.controls.boxSelector;
      var listeners = this.controls.listenersHandle;

      listeners.toggleOnClick = this._toggleOnClick();

      var onMouseDown = function (e) {
        if (me.model.isSelectionMode()) {
          me._beginBox(control, e);
        }
      };
      listeners.mousedown = google.maps.event.addListener(this.map, "mousedown", onMouseDown);
      listeners.mousedownData = this.map.data.addListener("mousedown", onMouseDown);

      var onMouseMove = function (e) {
        if (me.model.isSelectionMode() && control.mouseIsDown) {
          me._onBoxResize(control, e);
        }
      };
      listeners.mousemove = google.maps.event.addListener(this.map, "mousemove", onMouseMove);
      listeners.mousemoveData = this.map.data.addListener("mousemove", onMouseMove);

      var onMouseUp = this._endBox(control,
        function () {
          return me.model.isSelectionMode()
        },
        function (bounds) {
          me.model.leafs()
            .each(function (m) {
              var id = m.get("id");
              if (me.map.data.getFeatureById(id) != undefined) {
                $.when(m.get("geoJSON")).then(function (obj) {
                  var geometry = obj.geometry;
                  var isWithinArea = isInBounds(geometry, bounds);
                  // Area contains shape
                  if (isWithinArea) {
                    addToSelection(m);
                  }
                });
              }
            });
          me.trigger("engine:selection:complete");
        }
      );

      listeners.mouseup = google.maps.event.addListener(this.map, "mouseup", onMouseUp);
      listeners.mouseupData = this.map.data.addListener("mouseup", onMouseUp);

      //console.log("Selection mode enable");
    },


    /*-----------------------------*/
    _clearOnClick: function () {
      var me = this;
      return google.maps.event.addListener(this.map, "click", function (event) {
        clearSelection(me.model);
        me.trigger("engine:selection:complete");
      });
    },

    _toggleOnClick: function () {
      var me = this;
      return this.map.data.addListener("click", function (event) {
        var modelItem = event.feature.getProperty("model");
        toggleSelection(modelItem);
        me.trigger("engine:selection:complete");
        var featureType = modelItem.getFeatureType();
        me.trigger(featureType + ":click", me.wrapEvent(event));
      });
    },

    _beginBox: function (control, e) {
      control.mouseIsDown = true;
      control.mouseDownPos = e.latLng;
      this.map.setOptions({
        draggable: false
      });
    },

    _endBox: function (control, condition, callback) {
      var me = this;
      return function (e) {
        if (condition() && control.mouseIsDown && control.gribBoundingBox) {
          control.mouseIsDown = false;
          control.mouseUpPos = e.latLng;
          var bounds = control.gribBoundingBox.getBounds();

          callback(bounds);

          control.gribBoundingBox.setMap(null);
          control.gribBoundingBox = null;

          me.map.setOptions({
            draggable: true
          });
        }
      };
    },

    _onBoxResize: function (control, e) {
      if (control.gribBoundingBox !== null) { // box exists
        var bounds = new google.maps.LatLngBounds(control.mouseDownPos, null);
        bounds.extend(e.latLng);
        control.gribBoundingBox.setBounds(bounds); // If this statement is enabled, I lose mouseUp events
      } else { // create bounding box
        control.gribBoundingBox = new google.maps.Rectangle($.extend({
          map: this.map,
          clickable: false
        }, this.boxStyle));
      }
    },


    unselectPrevShape: function (key, shapes, shapeStyle) {
      var myself = this;
      var prevSelected = this.selectedFeature;
      if (prevSelected && prevSelected[0] !== key) {
        var prevShapes = prevSelected[1];
        var prevStyle = prevSelected[2];
        _.each(prevShapes, function (s) {
          var validStyle = myself.toNativeStyle(prevStyle);
          s.setOptions(validStyle);
          s.setVisible(false);
          s.setVisible(_.has(prevStyle, "visible") ? !!prevStyle.visible : true);
        });
      }
      this.selectedFeature = [key, shapes, shapeStyle];
    },

    addLayers: function () {
      //Prepare tilesets as overlays
      var layers = [],
        layerIds = [],
        layerOptions = [];
      for (var k = 0; k < this.tilesets.length; k++) {
        var thisTileset = this.tilesets[k].slice(0);
        layerIds.push(thisTileset);
        layerOptions.push({
          mapTypeId: thisTileset
        });

        if (this.tileServices[thisTileset]) {
          layers.push(this.tileLayer(thisTileset));
        } else {
          layers.push("");
        }

      } //for tilesets

      for (k = 0; k < layers.length; k++) {
        if (!_.isEmpty(layers[k])) {
          this.map.mapTypes.set(layerIds[k], layers[k]);
          //this.map.overlayMapTypes.push(layers[k]);
          this.map.setMapTypeId(layerIds[k]);
          this.map.setOptions(layerOptions[k]);
        }
      }

    },

    updateViewport: function (centerLongitude, centerLatitude, zoomLevel) {
      if (!zoomLevel) {
        zoomLevel = this.options.viewport.zoomLevel["default"];
      }
      this.map.setZoom(zoomLevel);
      if (!this.zoomExtends())
        this.map.panTo(new google.maps.LatLng(38, -9));
    },

    tileLayer: function (name) {
      var options = _.extend({
        tileSize: new google.maps.Size(256, 256),
        minZoom: 1,
        maxZoom: 19
      }, this.tileServicesOptions[name] || {});
      var urlList = this._switchUrl(this._getTileServiceURL(name));
      var myself = this;

      return new google.maps.ImageMapType(_.defaults({
        name: name.indexOf("/") >= 0 ? "custom" : name,
        getTileUrl: function (coord, zoom) {
          var limit = Math.pow(2, zoom);
          if (coord.y < 0 || coord.y >= limit) {
            return "404.png";
          } else {
            // use myself._selectUrl
            coord.x = ((coord.x % limit) + limit) % limit;
            var url;
            if (_.isArray(urlList)) {
              var s = _.template("${z}/${x}/${y}", {
                x: coord.x,
                y: coord.y,
                z: zoom
              }, {
                interpolate: /\$\{(.+?)\}/g
              });
              url = myself._selectUrl(s, urlList);
            } else {
              url = urlList;
            }
            return _.template(url, {
              x: coord.x,
              y: coord.y,
              z: zoom
            }, {
              interpolate: /\$\{(.+?)\}/g
            });
          }
        }
      }, options));
    },

    showPopup0: function (data, feature, popupHeight, popupWidth, contents, popupContentDiv, borderColor) {
      if (popupContentDiv && popupContentDiv.length > 0) {
        contents = $("#" + popupContentDiv).html();
      }

      var popup = new OurMapOverlay(feature.getGeometry().get(), popupWidth, popupHeight, contents, popupContentDiv, this.map, borderColor);
      this._popups = this._popups || [];
      _.each(this._popups, function (p) {
        p.setMap(null);
      });
      this._popups.push(popup);
    },

    showPopup: function (data, feature, popupHeight, popupWidth, contents, popupContentDiv, borderColor) {
      var popup = new google.maps.InfoWindow({
        content: contents,
        position: feature.getGeometry().get(),
        maxWidth: popupWidth
      });
      this._popups = this._popups || [];
      _.each(this._popups, function (p) {
        p.close();
      });
      popup.open(this.map);
      this._popups.push(popup);
    },

    registerViewportEvents: function () {
      var me = this;
      var eventMap = {
        "zoom_changed": "map:zoom",
        "center_changed": "map:center"
      };
      _.each(eventMap, function (mapEvent, engineEvent) {
        google.maps.event.addListener(me.map, engineEvent, function () {
          var wrappedEvent = wrapViewportEvent.call(me);
          me.trigger(mapEvent, wrappedEvent);
        });
      });


      function wrapViewportEvent() {
        var viewport = getViewport(this.map.getBounds());
        var wrappedEvent = {
          zoomLevel: this.map.getZoom(),
          center: transformPoint(this.map.getCenter() || new google.maps.LatLng()),
          viewport: viewport,
          raw: this.map
        };
        return wrappedEvent;

        function transformPoint(centerPoint) {
          var center = {
            latitude: centerPoint.lat(),
            longitude: centerPoint.lng()
          };
          return center;
        }

        function getViewport(bounds) {
          if (bounds) {
            viewport = {
              northEast: transformPoint(bounds.getNorthEast()),
              southWest: transformPoint(bounds.getSouthWest())
            };
          } else {
            viewport = {
              northEast: {},
              southWest: {}
            };
          }
        }
      }
    }

  });

  function clearSelection(modelItem){
    modelItem.root().setSelection(MapModel.SelectionStates.NONE);
  }

  function addToSelection(modelItem) {
    modelItem.setSelection(MapModel.SelectionStates.ALL);
  }

  function toggleSelection(modelItem) {
    modelItem.setSelection(
      (modelItem.getSelection() === MapModel.SelectionStates.ALL)
        ? MapModel.SelectionStates.NONE
        : MapModel.SelectionStates.ALL
    );
  }

  function isInBounds(geometry, bounds) {
    switch(geometry.type){
      case "MultiPolygon":
        return containsMultiPolygon(bounds, geometry.coordinates);
      case "Polygon":
        return containsPolygon(bounds, geometry.coordinates);
      case "Point":
        return containsPoint(bounds, geometry.coordinates);
      default:
        return false;
    }

    function containsMultiPolygon(bounds, multiPolygon) {
      var hasPolygon = function(polygon){
        return containsPolygon(bounds, polygon);
      };
      return _.some(multiPolygon, hasPolygon);
    }

    function containsPolygon(bounds, polygon){
      var hasPoint = function(point){
        return containsPoint(bounds, point);
      };
      return _.some(polygon, function (line) {
        return _.some(line, hasPoint)
      });
    }

    function containsPoint(bounds, point){
      var latLng = new google.maps.LatLng(point[1], point[0]);
      return bounds.contains(latLng);
    }
  }

});