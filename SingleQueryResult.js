///////////////////////////////////////////////////////////////////////////
// Copyright © 2014 - 2018 Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////

define([
    'dojo/_base/declare',
    'dijit/_WidgetBase',
    'dijit/_TemplatedMixin',
    'dijit/_WidgetsInTemplateMixin',
    'dojo/Evented',
    'dojo/text!./SingleQueryResult.html',
    'dojo/_base/lang',
    'dojo/_base/query',
     'esri/tasks/BufferParameters', //MJM
     'esri/tasks/query',  //MJM
    'dojo/_base/html',
    'dojo/_base/array',
    'dojo/Deferred',
    'esri/lang',
    'esri/tasks/QueryTask',
    'esri/tasks/FeatureSet',
    'esri/dijit/PopupTemplate',
    'esri/dijit/PopupRenderer',
    'esri/tasks/RelationshipQuery',
    'esri/renderers/SimpleRenderer',
    'jimu/utils',
    'jimu/symbolUtils',
    'jimu/dijit/Popup',
    'jimu/dijit/Message',
    'jimu/dijit/FeatureActionPopupMenu',
    'jimu/BaseFeatureAction',
    'jimu/dijit/SymbolChooser',
    'jimu/LayerInfos/LayerInfos',
    'jimu/FeatureActionManager',
    './SingleQueryLoader',
    './RelatedRecordsResult',
    'jimu/dijit/LoadingShelter',
    'dijit/form/Select'
  ],
  function(declare, _WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin, Evented, template, lang, query,
    BufferParameters, EsriQuery,
    html, array, Deferred, esriLang, QueryTask, FeatureSet, PopupTemplate, PopupRenderer,
    RelationshipQuery, SimpleRenderer, jimuUtils, jimuSymbolUtils, Popup, Message, PopupMenu, BaseFeatureAction,
    SymbolChooser, LayerInfos, FeatureActionManager, SingleQueryLoader, RelatedRecordsResult) {

    return declare([_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin, Evented], {

      baseClass: 'single-query-result',
      templateString: template,
      singleQueryLoader: null,
      featureLayer: null, //used for execute queryRelatedFeatures
      singleRelatedRecordsResult: null,
      multipleRelatedRecordsResult: null,
      popupMenu: null,

      //options:
      map: null,
      nls: null,
      currentAttrs: null,
      queryWidget: null,

      //public methods:
      //getCurrentAttrs
      //zoomToLayer
      //executeQueryForFirstTime
      //_emitFeaturesUpdate

      //events:
      //features-update
      //show-related-records
      //hide-related-records

      //we can get where,geometry and resultLayer from singleQueryLoader
      getCurrentAttrs: function() {
        if (this.singleQueryLoader) {
          return this.singleQueryLoader.getCurrentAttrs();
        }
        return null;
      },

      postCreate: function() {
        this.inherited(arguments);
        //init SingleQueryLoader
        this.singleQueryLoader = new SingleQueryLoader(this.map, this.currentAttrs);
        this.popupMenu = PopupMenu.getInstance();
        this.featureActionManager = FeatureActionManager.getInstance();
        this.btnFeatureAction.title = window.jimuNls.featureActions.featureActions;

          //MJM - Mailing Labels modification------------------------------------------------
            //need to add EsriQuery, BufferParameters 
            //Parcel Query parameters (https://developers.arcgis.com/javascript/3/jsapi/query-amd.html)
            this.qtParcelQuery = new QueryTask("https://arcgisprod02.tacoma.lcl/arcgis/rest/services/PDS/MailingLabels/MapServer/1");
            this.qParcelQuery = new EsriQuery();
              this.qParcelQuery.outFields = ["TaxParcelNumber"];
              this.qParcelQuery.returnGeometry = true;
              this.qParcelQuery.outSpatialReference = this.map.spatialReference;  //new esri.SpatialReference({wkid: 102100});

            //Buffer parcel parameters (https://developers.arcgis.com/javascript/3/jsapi/bufferparameters-amd.html)
            this.paramsBuffer_Parcel = new BufferParameters();
              this.paramsBuffer_Parcel.bufferSpatialReference = this.map.spatialReference;
              this.paramsBuffer_Parcel.outSpatialReference = this.map.spatialReference;
              this.paramsBuffer_Parcel.unionResults = true;
              this.paramsBuffer_Parcel.geodesic = true;  //geometries are in geographic coordinate system

            //Geometry Service
            this.localGeometryService = new esri.tasks.GeometryService("https://arcgisprod02.tacoma.lcl/arcgis/rest/services/Utilities/Geometry/GeometryServer");

          //End MJM Mailing Labels modification------------------------------------------------

      },

      destroy: function() {
        this.emit('features-update', {
          taskIndex: this.currentAttrs.queryTr.taskIndex,
          features: []
        });
        this.queryWidget = null;
        var currentAttrs = this.getCurrentAttrs();
        if (currentAttrs) {
          if (currentAttrs.query) {
            if (currentAttrs.query.resultLayer) {
              if (currentAttrs.query.resultLayer.getMap()) {
                this.map.removeLayer(currentAttrs.query.resultLayer);
              }
            }
            currentAttrs.query.resultLayer = null;
          }
        }
        this.inherited(arguments);
      },

      _isValidNumber: function(v) {
        return typeof v === "number" && !isNaN(v);
      },

      zoomToLayer: function() {
        var currentAttrs = this.getCurrentAttrs();
        var resultLayer = currentAttrs.query.resultLayer;
        if (resultLayer && !this._isTable(currentAttrs.layerInfo)) {
          //we should validate geometries to calculate extent
          var graphics = array.filter(resultLayer.graphics, lang.hitch(this, function(g) {
            var geo = g.geometry;
            if (geo) {
              //x and y maybe "NaN"
              if (geo.type === 'point') {
                return this._isValidNumber(geo.x) && this._isValidNumber(geo.y);
              } else if (geo.type === 'multipoint') {
                if (geo.points && geo.points.length > 0) {
                  return array.every(geo.points, lang.hitch(this, function(xyArray) {
                    if (xyArray) {
                      return this._isValidNumber(xyArray[0]) && this._isValidNumber(xyArray[1]);
                    } else {
                      return false;
                    }
                  }));
                } else {
                  return false;
                }
              } else {
                return true;
              }
            } else {
              return false;
            }
          }));
          if (graphics.length > 0) {
            var featureSet = jimuUtils.toFeatureSet(graphics);
            jimuUtils.zoomToFeatureSet(this.map, featureSet);
          }
        }
      },

      _emitFeaturesUpdate: function(){
        this.emit('features-update', {
          taskIndex: this.currentAttrs.queryTr.taskIndex,
          features: this.currentAttrs.query.resultLayer.graphics
        });
      },

      //start to query
      executeQueryForFirstTime: function() {
        var def = new Deferred();

        //reset result page
        this._clearResultPage();
        this._hideResultsNumberDiv();

        var currentAttrs = this.getCurrentAttrs();

        var resultLayer = currentAttrs.query.resultLayer;

        var callback = lang.hitch(this, function(features) {
          if (!this.domNode) {
            return;
          }
          this.shelter.hide();
          var allCount = currentAttrs.query.allCount;
          this._updateNumSpan(allCount);
          if (allCount > 0) {
            this._addResultItems(features, resultLayer);
            this._addResultLayerToMap(resultLayer);
            this.zoomToLayer();
          }
          def.resolve(allCount);
          this._emitFeaturesUpdate();
        });

        var errorCallback = lang.hitch(this, function(err) {
          console.error(err);
          if (!this.domNode) {
            return;
          }
          this.shelter.hide();
          if (resultLayer) {
            this.map.removeLayer(resultLayer);
          }
          resultLayer = null;
          this._showQueryErrorMsg();
          def.reject(err);
        });

        this.shelter.show();

        if (currentAttrs.queryType !== 3) {
          this._showResultsNumberDiv();
        }

        //execute Query for first time
        //MJM COMMENT OUT -> this.singleQueryLoader.executeQueryForFirstTime().then(callback, errorCallback);

        //MJM COMMENT OUT -> return def;
          //START Mailing Labels here by manipulating where clause from "TaxParcelNumber =" to "TaxParcelNumber IN ()"
          //  only if the current task contains 'Parcel Number' in name 
          if (this.singleQueryLoader.currentAttrs.queryTr.textContent.search('Parcel Number')!=-1){
            //debugger;   //In console type: keys(this) & values(this) http://anti-code.com/devtools-cheatsheet/
            if (this.queryWidget.currentTaskSetting.spatialFilterByDrawing.searchDistance.cbx.checked) {
              //buffer parcel list
              myWhereClause = this._MailingLabels_manipulateWhereClause(this.singleQueryLoader.currentAttrs.query.where);  //manipulate where clause
              var currentDistance = this.queryWidget.currentTaskSetting.spatialFilterByDrawing.searchDistance.numberTextBox._lastValueReported;  //update buffer distance
              var currentUnit = this.queryWidget.currentTaskSetting.spatialFilterByDrawing.searchDistance.unitSelect._lastValueReported;  //update buffer units

              //RUN QUERY WITH INITIAL PARCEL LIST
              this._MailingLabels_bufferQuery(myWhereClause, currentDistance, currentUnit).then(lang.hitch(this,function(value){  
                // Deferred - update success
                this.singleQueryLoader.currentAttrs.query.where = value;  //update where clause

                  //RUN QUERY WITH NEW PARCEL LIST - NEED TO DUPLICATE SUCCESS & ERROR FUNCTIONS TO KEEP SCOPE
                  this.singleQueryLoader.executeQueryForFirstTime().then(lang.hitch(this, function(features) {
                    var currentAttrs = this.getCurrentAttrs();
                    var resultLayer = currentAttrs.query.resultLayer;
                    if (!this.domNode) {
                      return;
                    }
                    this.shelter.hide();
                    var allCount = currentAttrs.query.allCount;
                    this._updateNumSpan(allCount);
                    if (allCount > 0) {
                      this._addResultItems(features, resultLayer);
                      this._addResultLayerToMap(resultLayer);
                    }
                    def.resolve(allCount);
                  }),  function(err) {
                    console.error(err);
                    if (!this.domNode) {
                      return;
                    }
                    this.shelter.hide();
                    if (resultLayer) {
                      this.map.removeLayer(resultLayer);
                    }
                    resultLayer = null;
                    this._showQueryErrorMsg();
                    def.reject(err);
                  }); //end deferred query
              }), function(err){ //lang.hitch
                // Do something when the process errors out
                alert(err);
              }); //end deferred buffer parcel list

              return def;

            } else {
              //no buffer requested
              this.singleQueryLoader.currentAttrs.query.where = this._MailingLabels_manipulateWhereClause(this.singleQueryLoader.currentAttrs.query.where);  //manipulate where clause
              this.singleQueryLoader.executeQueryForFirstTime().then(callback, errorCallback);  //execute query
              return def;
            }
            
          } else {
            //all other query tasks
            this.singleQueryLoader.executeQueryForFirstTime().then(callback, errorCallback);
            return def;
          }

         //End Mailing Labels modifications------------------------------------------------------
      },

      getResultLayer: function() {
        var currentAttrs = this.getCurrentAttrs();
        var resultLayer = lang.getObject("query.resultLayer", false, currentAttrs);
        return resultLayer;
      },

      showResultLayer: function() {
        var resultLayer = this.getResultLayer();
        if (resultLayer) {
          resultLayer.show();
        }
      },

      hideResultLayer: function() {
        var resultLayer = this.getResultLayer();
        if (resultLayer) {
          resultLayer.hide();
        }
      },

      showLayer: function() {
        this.showResultLayer();
        if (this.multipleRelatedRecordsResult) {
          this.multipleRelatedRecordsResult.showLayer();
        }
        if (this.singleRelatedRecordsResult) {
          this.singleRelatedRecordsResult.showLayer();
        }
      },

      hideLayer: function() {
        this.hideResultLayer();
        if (this.multipleRelatedRecordsResult) {
          this.multipleRelatedRecordsResult.hideLayer();
        }
        if (this.singleRelatedRecordsResult) {
          this.singleRelatedRecordsResult.hideLayer();
        }
      },

      _addResultLayerToMap: function(resultLayer) {
        if (this.map.graphicsLayerIds.indexOf(resultLayer.id) < 0) {
          this.map.addLayer(resultLayer);
        }
      },

      _showResultsNumberDiv: function() {
        html.setStyle(this.resultsNumberDiv, 'display', 'block');
      },

      _hideResultsNumberDiv: function() {
        html.setStyle(this.resultsNumberDiv, 'display', 'none');
      },

      _updateNumSpan: function(allCount) {
        this.numSpan.innerHTML = jimuUtils.localizeNumber(allCount);
      },

      _isTable: function(layerDefinition) {
        return layerDefinition.type === "Table";
      },

      _onResultsScroll: function() {
        if (!jimuUtils.isScrollToBottom(this.resultsContainer)) {
          return;
        }

        var currentAttrs = this.getCurrentAttrs();

        var nextIndex = currentAttrs.query.nextIndex;
        var allCount = currentAttrs.query.allCount;

        if (nextIndex >= allCount) {
          return;
        }

        var resultLayer = currentAttrs.query.resultLayer;

        var callback = lang.hitch(this, function(features) {
          if (!this.domNode) {
            return;
          }
          this.shelter.hide();
          this._addResultItems(features, resultLayer);
          this.zoomToLayer();
          this._emitFeaturesUpdate();
        });

        var errorCallback = lang.hitch(this, function(err) {
          console.error(err);
          if (!this.domNode) {
            return;
          }
          this._showQueryErrorMsg();
          this.shelter.hide();
        });

        this.shelter.show();

        this.singleQueryLoader.executeQueryWhenScrollToBottom().then(callback, errorCallback);
      },

      _clearResultPage: function() {
        this._hideInfoWindow();
        this._unSelectResultTr();
        html.empty(this.resultsTbody);
        this._updateNumSpan(0);
      },

      _unSelectResultTr: function() {
        if (this.resultTr) {
          html.removeClass(this.resultTr, 'jimu-state-active');
        }
        this.resultTr = null;
      },

      _selectResultTr: function(tr) {
        this._unSelectResultTr();
        this.resultTr = tr;
        if (this.resultTr) {
          html.addClass(this.resultTr, 'jimu-state-active');
        }
      },

      _addResultItems: function(features, resultLayer) {
        var currentAttrs = this.getCurrentAttrs();
        var url = currentAttrs.config.url;
        var objectIdField = currentAttrs.config.objectIdField;

        var relationships = this._getCurrentRelationships();
        var popupInfo = currentAttrs.config.popupInfo;
        var popupInfoWithoutMediaInfos = lang.clone(popupInfo);
        popupInfoWithoutMediaInfos.mediaInfos = [];
        var popupTemplate2 = new PopupTemplate(popupInfoWithoutMediaInfos);

        var shouldCreateSymbolNode = true;

        var renderer = resultLayer.renderer;
        if (!renderer) {
          shouldCreateSymbolNode = false;
        }

        var isWebMapShowRelatedRecordsEnabled = this._isWebMapShowRelatedRecordsEnabled();

        array.forEach(features, lang.hitch(this, function(feature, i) {
          var trClass = '';
          if (i % 2 === 0) {
            trClass = 'even';
          } else {
            trClass = 'odd';
          }

          resultLayer.add(feature);

          var options = {
            resultLayer: resultLayer,
            feature: feature,
            trClass: trClass,
            popupTemplate2: popupTemplate2,
            relationships: relationships,
            objectIdField: objectIdField,
            url: url,
            relationshipPopupTemplates: currentAttrs.relationshipPopupTemplates,
            shouldCreateSymbolNode: shouldCreateSymbolNode,
            isWebMapShowRelatedRecordsEnabled: isWebMapShowRelatedRecordsEnabled
          };

          this._createQueryResultItem(options);
        }));
      },

      _createQueryResultItem: function(options) {
        var resultLayer = options.resultLayer;
        var feature = options.feature;
        var trClass = options.trClass;
        var popupTemplate2 = options.popupTemplate2;
        var relationships = options.relationships;
        var objectIdField = options.objectIdField;
        var url = options.url;
        var relationshipPopupTemplates = options.relationshipPopupTemplates;
        var shouldCreateSymbolNode = options.shouldCreateSymbolNode;
        var isWebMapShowRelatedRecordsEnabled = options.isWebMapShowRelatedRecordsEnabled;

        var attributes = feature && feature.attributes;
        if (!attributes) {
          return;
        }

        //create PopupRenderer
        var strItem = '<tr class="jimu-table-row jimu-table-row-separator query-result-item" ' +
          ' cellpadding="0" cellspacing="0"><td>' +
          '<table class="query-result-item-table">' +
          '<tbody>' +
          '<tr>' +
          '<td class="symbol-td"></td><td class="popup-td"></td>' +
          '</tr>' +
          '</tbody>' +
          '</table>' +
          '</td></tr>';
        var trItem = html.toDom(strItem);
        html.addClass(trItem, trClass);
        html.place(trItem, this.resultsTbody);
        trItem.feature = feature;

        var symbolTd = query('.symbol-td', trItem)[0];
        if (shouldCreateSymbolNode) {
          try {
            var renderer = resultLayer.renderer;
            if (renderer) {
              var symbol = renderer.getSymbol(feature);
              if (symbol) {
                var symbolNode = jimuSymbolUtils.createSymbolNode(symbol, {
                  width: 32,
                  height: 32
                });
                if (symbolNode) {
                  html.place(symbolNode, symbolTd);
                }
              }
            }
          } catch (e) {
            console.error(e);
          }
        } else {
          html.destroy(symbolTd);
        }

        var popupTd = query('.popup-td', trItem)[0];
        var popupRenderer = new PopupRenderer({
          template: popupTemplate2,
          graphic: feature,
          chartTheme: popupTemplate2.chartTheme
        });
        html.place(popupRenderer.domNode, popupTd);
        popupRenderer.startup();

        //create TitlePane for relationships
        if (objectIdField && relationships && relationships.length > 0 && isWebMapShowRelatedRecordsEnabled) {
          var objectId = feature.attributes[objectIdField];
          //var lastIndex = relationships.length - 1;
          array.forEach(relationships, lang.hitch(this, function(relationship) {
            //{id,name,relatedTableId}
            //var layerName = this._getLayerNameByRelationshipId(relationship.id);
            var relationshipLayerInfo = this._getRelationshipLayerInfo(relationship.relatedTableId);
            var layerName = relationshipLayerInfo.name;
            var relationshipPopupTemplate = relationshipPopupTemplates[relationship.relatedTableId];

            var btn = html.create("div", {
              "class": "related-table-btn",
              "innerHTML": layerName //this.nls.attributesFromRelationship + ': ' + layerName
            }, popupTd);
            btn.queryStatus = "unload";
            btn.url = url;
            btn.layerName = layerName;
            btn.objectId = objectId;
            btn.relationship = relationship;
            btn.relationshipLayerInfo = relationshipLayerInfo;
            btn.relationshipPopupTemplate = relationshipPopupTemplate;
          }));
        }
      },

      _onBtnMultipleRelatedBackClicked: function() {
        this._showFeaturesResultDiv();
      },

      _onBtnSingleRelatedBackClicked: function() {
        this._showFeaturesResultDiv();
      },

      _showFeaturesResultDiv: function() {
        if (this.multipleRelatedRecordsResult) {
          this.multipleRelatedRecordsResult.destroy();
        }
        this.multipleRelatedRecordsResult = null;

        if (this.singleRelatedRecordsResult) {
          this.singleRelatedRecordsResult.destroy();
        }
        this.singleRelatedRecordsResult = null;

        html.addClass(this.multipleRelatedRecordsDiv, 'not-visible');
        html.addClass(this.singleRelatedRecordsResultDiv, 'not-visible');
        html.removeClass(this.featuresResultDiv, 'not-visible');
        this.emit("hide-related-records");
      },

      _showMultipleRelatedRecords: function() {
        if (this.singleRelatedRecordsResult) {
          this.singleRelatedRecordsResult.destroy();
        }
        this.singleRelatedRecordsResult = null;

        html.addClass(this.featuresResultDiv, 'not-visible');
        html.addClass(this.singleRelatedRecordsResultDiv, 'not-visible');
        html.removeClass(this.multipleRelatedRecordsDiv, 'not-visible');
        this.emit("show-related-records");

        var relationships = this._getCurrentRelationships();
        this.relatedLayersSelect.removeOption(this.relatedLayersSelect.getOptions());
        array.forEach(relationships, lang.hitch(this, function(relationship) {
          var relationshipLayerInfo = this._getRelationshipLayerInfo(relationship.relatedTableId);
          var relationshipPopupTemplate = this.currentAttrs.relationshipPopupTemplates[relationship.relatedTableId];
          var layerName = relationshipLayerInfo.name;

          this.relatedLayersSelect.addOption({
            value: relationship.id + "",//should be a string
            label: layerName,
            relationship: relationship,
            relationshipLayerInfo: relationshipLayerInfo,
            relationshipPopupTemplate: relationshipPopupTemplate
          });
        }));

        this._onRelatedLayersSelectChanged();
      },

      _onRelatedLayersSelectChanged: function() {
        var value = this.relatedLayersSelect.get('value');
        var option = this.relatedLayersSelect.getOptions(value);
        if (!option) {
          return;
        }
        /*{
            value: relationship.id,
            label: layerName,
            relationship: relationship,
            relationshipLayerInfo: relationshipLayerInfo,
            relationshipPopupTemplate: relationshipPopupTemplate,
            selected: index === 0
          }*/
        if (this.multipleRelatedRecordsResult) {
          this.multipleRelatedRecordsResult.destroy();
        }
        this.multipleRelatedRecordsResult = new RelatedRecordsResult({
          map: this.map,
          layerDefinition: option.relationshipLayerInfo,
          nls: this.nls,
          config: this.currentAttrs.config
        });
        this.multipleRelatedRecordsResult.placeAt(this.multipleRelatedRecordsDiv, 'first');
        var url = this.currentAttrs.config.url;
        this.shelter.show();
        var errorCallback = lang.hitch(this, function(err) {
          console.error(err);
          if (!this.domNode) {
            return;
          }
          this.shelter.hide();
        });
        //var objectIds = this.currentAttrs.query.objectIds;
        this.singleQueryLoader.getObjectIdsForAllRelatedRecordsAction().then(lang.hitch(this, function(objectIds){
          var def = this._queryRelatedRecords(url, objectIds, option.relationship.id);
          def.then(lang.hitch(this, function(response) {
            if (!this.domNode) {
              return;
            }
            this.shelter.hide();
            //{objectId:{features,geometryType,spatialReference,transform}}
            var features = [];
            array.forEach(objectIds, lang.hitch(this, function(objectId) {
              var a = response[objectId];
              if (a && a.features && a.features.length > 0) {
                features = features.concat(a.features);
              }
            }));

            var relationshipLayerInfo = option.relationshipLayerInfo;
            var featureSet = new FeatureSet();
            featureSet.fields = lang.clone(relationshipLayerInfo.fields);
            featureSet.features = features;
            featureSet.geometryType = relationshipLayerInfo.geometryType;
            featureSet.fieldAliases = {};
            array.forEach(featureSet.fields, lang.hitch(this, function(fieldInfo) {
              var fieldName = fieldInfo.name;
              var fieldAlias = fieldInfo.alias || fieldName;
              featureSet.fieldAliases[fieldName] = fieldAlias;
            }));
            this.multipleRelatedRecordsResult.setResult(option.relationshipPopupTemplate, featureSet);
          }), errorCallback);
        }), errorCallback);
      },

      _showSingleRelatedRecordsDiv: function() {
        if (this.multipleRelatedRecordsResult) {
          this.multipleRelatedRecordsResult.destroy();
        }
        this.multipleRelatedRecordsResult = null;

        html.addClass(this.featuresResultDiv, 'not-visible');
        html.addClass(this.multipleRelatedRecordsDiv, 'not-visible');
        html.removeClass(this.singleRelatedRecordsResultDiv, 'not-visible');
        this.emit("show-related-records");
      },

      _onSingleRelatedTableButtonClicked: function(target) {
        if (this.singleRelatedRecordsResult) {
          this.singleRelatedRecordsResult.destroy();
        }
        this.singleRelatedRecordsResult = null;
        var url = target.url;
        var layerName = target.layerName;
        var objectId = target.objectId;
        var relationship = target.relationship;
        var relationshipLayerInfo = target.relationshipLayerInfo;
        var relationshipPopupTemplate = target.relationshipPopupTemplate;
        this.singleRelatedRecordsResult = new RelatedRecordsResult({
          map: this.map,
          layerDefinition: relationshipLayerInfo,
          nls: this.nls,
          config: this.currentAttrs.config
        });
        this.singleRelatedRecordsResult.placeAt(this.singleRelatedRecordsResultDiv, 'first');
        // this.own(on(this.singleRelatedRecordsResult, 'back', lang.hitch(this, function(){
        //   this._showFeaturesResultDiv();
        // })));
        this._showSingleRelatedRecordsDiv();
        var callback = lang.hitch(this, function() {
          var featureSet = new FeatureSet();
          featureSet.fields = lang.clone(relationshipLayerInfo.fields);
          featureSet.features = target.relatedFeatures;
          featureSet.geometryType = relationshipLayerInfo.geometryType;
          featureSet.fieldAliases = {};
          array.forEach(featureSet.fields, lang.hitch(this, function(fieldInfo) {
            var fieldName = fieldInfo.name;
            var fieldAlias = fieldInfo.alias || fieldName;
            featureSet.fieldAliases[fieldName] = fieldAlias;
          }));
          this.singleRelatedRecordsResult.setResult(relationshipPopupTemplate, featureSet);

          this.relatedTitleDiv.innerHTML = layerName;
        });
        //execute executeRelationshipQuery when firstly click target
        if (target.queryStatus === "unload") {
          target.queryStatus = "loading";
          this.shelter.show();
          this._queryRelatedRecords(url, [objectId], relationship.id).then(lang.hitch(this, function(response) {
            if (!this.domNode) {
              return;
            }
            this.shelter.hide();
            //{objectId:{features,geometryType,spatialReference,transform}}
            var result = response && response[objectId];
            var features = result && result.features;
            features = features || [];
            target.relatedFeatures = features;
            target.queryStatus = "loaded";
            callback();
          }), lang.hitch(this, function(err) {
            if (!this.domNode) {
              return;
            }
            this.shelter.hide();
            console.error(err);
            target.queryStatus = "unload";
            callback();
          }));
        } else if (target.queryStatus === "loaded") {
          callback();
        }
      },

      _queryRelatedRecords: function(url, objectIds, relationshipId) {
        var queryTask = new QueryTask(url);
        var relationshipQuery = new RelationshipQuery();
        relationshipQuery.objectIds = objectIds;
        relationshipQuery.relationshipId = relationshipId;
        relationshipQuery.outFields = ['*'];
        relationshipQuery.returnGeometry = true;
        relationshipQuery.outSpatialReference = this.map.spatialReference;
        return queryTask.executeRelationshipQuery(relationshipQuery);
      },

      _getCurrentRelationships: function() {
        var currentAttrs = this.getCurrentAttrs();
        return currentAttrs.queryTr.layerInfo.relationships || [];
      },

      //{id,name,relatedTableId}
      //relationshipId is the id attribute
      _getRelationshipInfo: function(relationshipId) {
        var relationships = this._getCurrentRelationships();
        for (var i = 0; i < relationships.length; i++) {
          if (relationships[i].id === relationshipId) {
            return relationships[i];
          }
        }
        return null;
      },

      _getRelationshipLayerInfo: function(relatedTableId) {
        var currentAttrs = this.getCurrentAttrs();
        var layerInfo = currentAttrs.relationshipLayerInfos[relatedTableId];
        return layerInfo;
      },

      _tryLocaleNumber: function(value) {
        var result = value;
        if (esriLang.isDefined(value) && isFinite(value)) {
          try {
            //if pass "abc" into localizeNumber, it will return null
            var a = jimuUtils.localizeNumber(value);
            if (typeof a === "string") {
              result = a;
            }
          } catch (e) {
            console.error(e);
          }
        }
        //make sure the retun value is string
        result += "";
        return result;
      },

      _showQueryErrorMsg: function( /* optional */ msg) {
        new Message({
          message: msg || this.nls.queryError
        });
      },

      _onResultsTableClicked: function(event) {
        var target = event.target || event.srcElement;
        if (!html.isDescendant(target, this.resultsTable)) {
          return;
        }

        if (html.hasClass(target, 'related-table-btn')) {
          this._onSingleRelatedTableButtonClicked(target);
          return;
        }

        var tr = jimuUtils.getAncestorDom(target, lang.hitch(this, function(dom) {
          return html.hasClass(dom, 'query-result-item');
        }), this.resultsTbody);
        if (!tr) {
          return;
        }

        this._selectResultTr(tr);

        html.addClass(tr, 'jimu-state-active');
        var feature = tr.feature;
        var geometry = feature.geometry;
        if (geometry) {
          var geoType = geometry.type;
          var centerPoint, extent;
          if (geoType === 'point') {
            centerPoint = geometry;
          } else if (geoType === 'multipoint') {
            if (geometry.points.length === 1) {
              centerPoint = geometry.getPoint(0);
            } else if (geometry.points.length > 1) {
              centerPoint = geometry.getPoint(0);
            }

          } else if (geoType === 'polyline') {
            extent = geometry.getExtent();
            extent = extent.expand(1.4);
            centerPoint = extent.getCenter();
          } else if (geoType === 'polygon') {
            extent = geometry.getExtent();
            extent = extent.expand(1.4);
            centerPoint = extent.getCenter();
          } else if (geoType === 'extent') {
            extent = geometry;
            extent = extent.expand(1.4);
            centerPoint = extent.getCenter();
          }
          var featureSet = jimuUtils.toFeatureSet(feature);
          jimuUtils.zoomToFeatureSet(this.map, featureSet);
          if (typeof this.map.infoWindow.setFeatures === 'function') {
            this.map.infoWindow.setFeatures([feature]);
          }
          if (typeof this.map.infoWindow.reposition === 'function') {
            this.map.infoWindow.reposition();
          }
          this.map.infoWindow.show(centerPoint);
        }
      },

      _hideInfoWindow: function() {
        if (this.map && this.map.infoWindow) {
          this.map.infoWindow.hide();
          if (typeof this.map.infoWindow.setFeatures === 'function') {
            this.map.infoWindow.setFeatures([]);
          }
        }
      },

      /* ----------------------------operations-------------------------------- */

      _getFeatureSet: function() {
        var layer = this.currentAttrs.query.resultLayer;
        //get popup info for field alias
        var popupInfos = null;
        var popupInfoObj = this.currentAttrs.config && this.currentAttrs.config.popupInfo;
        if (popupInfoObj) {
          popupInfos = popupInfoObj.fieldInfos;
        }

        var featureSet = new FeatureSet();
        featureSet.fields = lang.clone(layer.fields);
        featureSet.features = [].concat(layer.graphics);
        featureSet.geometryType = layer.geometryType;
        featureSet.fieldAliases = {};
        array.forEach(featureSet.fields, lang.hitch(this, function(fieldInfo) {
          var fieldName = fieldInfo.name;
          var fieldAlias = this._getFieldAliasByPopupInfo(fieldInfo, popupInfos);
          featureSet.fieldAliases[fieldName] = fieldAlias;
        }));
        return featureSet;
      },

      _getFieldAliasByPopupInfo: function(fieldInfo, popupInfos) {
        var fieldName = fieldInfo.name;
        var fieldAlias = fieldInfo.alias || fieldName;
        if (popupInfos && popupInfos.length) {
          var popupInfo = popupInfos.filter(function(ppInfo) {
            return ppInfo.fieldName === fieldName;
          })[0];
          if (popupInfo) {
            fieldAlias = popupInfo.label;
          }
        }
        return fieldAlias;
      },

      _onBtnMenuClicked: function(evt) {
        var position = html.position(evt.target || evt.srcElement);
        var featureSet = this._getFeatureSet();
        var currentAttrs = this.getCurrentAttrs();
        var layer = currentAttrs.query.resultLayer;
        this.featureActionManager.getSupportedActions(featureSet, layer).then(lang.hitch(this, function(actions) {
          array.forEach(actions, lang.hitch(this, function(action) {
            action.data = featureSet;
          }));

          if (!currentAttrs.config.enableExport) {
            var exportActionNames = [
              'ExportToCSV',
              'ExportToFeatureCollection',
              'ExportToGeoJSON',
              'SaveToMyContent'
            ];
            actions = array.filter(actions, lang.hitch(this, function(action) {
              return exportActionNames.indexOf(action.name) < 0;
            }));
          }

          actions = array.filter(actions, lang.hitch(this, function(action) {
            return action.name !== 'CreateLayer';
          }));

          var removeAction = new BaseFeatureAction({
            name: "RemoveQueryResult",
            iconClass: 'icon-close',
            label: this.nls.removeThisResult,
            iconFormat: 'svg',
            map: this.map,
            onExecute: lang.hitch(this, this._removeResult)
          });
          removeAction.name = "RemoveQueryResult";
          removeAction.data = featureSet;
          actions.push(removeAction);

          var relatedRecordAction = this._getRelatedTableAction(featureSet);
          if (relatedRecordAction) {
            actions.push(relatedRecordAction);
          }

          var symbolAction = this._getSymbolAction(featureSet);
          if (symbolAction) {
            actions.push(symbolAction);
          }

          this.popupMenu.setActions(actions);
          this.popupMenu.show(position);
        }));
      },

      _getObjectIdField: function() {
        return this.currentAttrs.config.objectIdField;
      },

      _getSymbolAction: function(featureSet) {
        var action = null;
        if (this.currentAttrs.query.resultLayer.renderer && this.currentAttrs.config.canModifySymbol) {
          var features = featureSet && featureSet.features;
          action = new BaseFeatureAction({
            name: "ChangeSymbol",
            label: this.nls.changeSymbol,
            data: features,
            iconClass: 'icon-edit-symbol',
            iconFormat: 'svg',
            map: this.map,
            onExecute: lang.hitch(this, this._showSymbolChooser)
          });
        }
        return action;
      },

      _showSymbolChooser: function() {
        var resultLayer = this.currentAttrs.query.resultLayer;
        var renderer = resultLayer.renderer;
        var args = {};
        var symbol = renderer.defaultSymbol || renderer.symbol;
        if (symbol) {
          args.symbol = symbol;
        } else {
          var symbolType = jimuUtils.getSymbolTypeByGeometryType(resultLayer.geometryType);
          args.type = symbolType;
        }
        var symbolChooser = new SymbolChooser(args);
        var popup = new Popup({
          width: 380,
          autoHeight: true,
          titleLabel: this.nls.changeSymbol,
          content: symbolChooser,
          onClose: lang.hitch(this, function() {
            symbolChooser.destroy();
            symbolChooser = null;
            popup = null;
          }),
          buttons: [{
            label: window.jimuNls.common.ok,
            onClick: lang.hitch(this, function() {
              var symbol = symbolChooser.getSymbol();
              this._updateSymbol(symbol);
              popup.close();
            })
          }, {
            label: window.jimuNls.common.cancel,
            onClick: lang.hitch(this, function() {
              popup.close();
            })
          }]
        });
      },

      _updateSymbol: function(symbol) {
        var renderer = new SimpleRenderer(symbol);
        var resultLayer = this.currentAttrs.query.resultLayer;
        resultLayer.setRenderer(renderer);
        resultLayer.redraw();
        var symbolNodes = query(".symbol", this.resultsTable);
        array.forEach(symbolNodes, lang.hitch(this, function(oldSymbolNode) {
          var parent = oldSymbolNode.parentElement;
          html.destroy(oldSymbolNode);
          var newSymbolNode = jimuSymbolUtils.createSymbolNode(symbol, {
            width: 32,
            height: 32
          });
          if (newSymbolNode) {
            html.place(newSymbolNode, parent);
          }
        }));
      },

      _getRelatedTableAction: function(featureSet) {
        var action = null;
        var features = featureSet && featureSet.features;
        var relationships = this._getCurrentRelationships();
        var objectIdField = this._getObjectIdField();
        if (objectIdField && features.length > 0 && relationships && relationships.length > 0 &&
            this._isWebMapShowRelatedRecordsEnabled()) {
          action = new BaseFeatureAction({
            iconClass: 'icon-show-related-record',
            icon: '',
            data: featureSet,
            label: this.nls.showAllRelatedRecords,
            onExecute: lang.hitch(this, function() {
              this._showMultipleRelatedRecords();
              var def = new Deferred();
              def.resolve();
              return def;
            }),
            getIcon: function() {
              return "";
            }
          });
        }
        return action;
      },

      _isWebMapShowRelatedRecordsEnabled: function(){
        //#2887
        var popupInfo = this.currentAttrs.config.popupInfo;
        if(popupInfo.relatedRecordsInfo){
          return popupInfo.relatedRecordsInfo.showRelatedRecords !== false;
        }
        return true;
      },

      _removeResult: function() {
        this.queryWidget.removeSingleQueryResult(this);
        this._hideInfoWindow();
      },

      _getAvailableWidget: function(widgetName) {
        var appConfig = this.queryWidget.appConfig;
        var attributeTableWidget = appConfig.getConfigElementsByName(widgetName)[0];
        if (attributeTableWidget && attributeTableWidget.visible) {
          return attributeTableWidget;
        }
        return null;
      },

      _openAttributeTable: function() {
        var attributeTableWidget = this._getAvailableWidget("AttributeTable");

        if (!attributeTableWidget) {
          return;
        }

        var layerInfosObj = LayerInfos.getInstanceSync();
        var layerId = this.currentAttrs.query.resultLayer.id;
        var layerInfo = layerInfosObj.getLayerInfoById(layerId);
        var widgetManager = this.queryWidget.widgetManager;
        widgetManager.triggerWidgetOpen(attributeTableWidget.id).then(lang.hitch(this, function() {
          this.queryWidget.publishData({
            'target': 'AttributeTable',
            'layer': layerInfo
          });
        }));
      },
      //START MJM Mailing Label functions------------------------------------------------------
      _MailingLabels_manipulateWhereClause: function(whereClause) {
        //whereClause example: TaxParcelNumber = '2008070020 2008070030'
        var whereClause2 = whereClause.replace(/,/g, " ");  //remove commas from string (leave space)
            whereClause2 = whereClause2.replace(/'|"|“|”|‘|’/g, "");  //remove single-double quotes from string
            //console.error(whereClause2);
        var whereClauseObj = whereClause2.split(' = ');  //split field [0] from values [1]
        //console.error('0 - ',whereClauseObj[0], ' 1 - ',whereClauseObj[1]);

         var temp = "";
         var theQuote = "'";
         
         string = '' + whereClauseObj[1];
         splitstring = string.split(" ");
        
        
         for (i = 0; i < splitstring.length; i++){
          if (i==0) {
           temp += theQuote + splitstring[i] + theQuote ;
          } else {
           temp += ", " + theQuote + splitstring[i] + theQuote ;
          }
         }

         //console.error(whereClauseObj[0] + " IN (" + temp + ")");
         return whereClauseObj[0] + " IN (" + temp + ")";
      },

      _MailingLabels_bufferQuery: function(whereClause, distance, unit) {
        //Query search box parcel list to get geometry, buffer, query with resulting geometry, and
        //send back a new list of parcels for where clause
        var newWhereClause = new Deferred();
        this.qParcelQuery.where = whereClause;  //Update where clause with parcel list (modified) from search box

        //RUN PARCEL NUMBER QUERY 
        this.qtParcelQuery.execute(this.qParcelQuery, lang.hitch(this,function(results){
          //Results - parcel geometry
          var parcelGeometry = [];  //Array to hold all geometry values from results
          var parcelResults = results.features;  //All parcel feature results
          for (var index in parcelResults) {
            parcelGeometry.push(parcelResults[index].geometry);  //update geometry array
          }

          //Update buffer geometry, distance, & unit 
          this.paramsBuffer_Parcel.geometries = parcelGeometry;
          this.paramsBuffer_Parcel.distances = [ distance ];
          //https://developers.arcgis.com/javascript/3/jsapi/geometryservice-amd.html
          //Menu values: "FEET" | "MILES" | "KILOMETERS" | "METERS" | "YARDS" | "NAUTICAL_MILES"
          //Geometry Service values: "UNIT_FOOT" | "UNIT_STATUTE_MILE" | "UNIT_KILOMETER" | "UNIT_METER" | "none - x3" | "UNIT_NAUTICAL_MILE"
          if (unit === 'FEET') {
           this.paramsBuffer_Parcel.unit = esri.tasks.GeometryService["UNIT_FOOT"];
          } else if (unit === 'MILES') {
           this.paramsBuffer_Parcel.unit = esri.tasks.GeometryService["UNIT_STATUTE_MILE"];
          } else if (unit === 'KILOMETERS') {
           this.paramsBuffer_Parcel.unit = esri.tasks.GeometryService["UNIT_KILOMETER"];
          } else if (unit === 'METERS') {
           this.paramsBuffer_Parcel.unit = esri.tasks.GeometryService["UNIT_METER"];
          } else if (unit === 'NAUTICAL_MILES') {
           this.paramsBuffer_Parcel.unit = esri.tasks.GeometryService["UNIT_NAUTICAL_MILE"];
          } else if (unit === 'YARDS') {
           this.paramsBuffer_Parcel.unit = esri.tasks.GeometryService["UNIT_FOOT"];
           this.paramsBuffer_Parcel.distances = [ distance * 3 ];  //no yards unit, so do the math to update distance instead
          } 
          
          //RUN BUFFER (UNION RESULTING POLYGONS)
          this.localGeometryService.buffer(this.paramsBuffer_Parcel, lang.hitch(this,function(results){
            //Update query parameters - https://developers.arcgis.com/javascript/3/jsapi/query-amd.html
            this.qParcelQuery.where = '';  //reset
            this.qParcelQuery.geometry = results[0];  //use unioned parcel buffer polygon [0]
            
            //RUN PARCEL QUERY WITH BUFFER POLYGON
            this.qtParcelQuery.execute(this.qParcelQuery, lang.hitch(this,function(results){
              var temp = "";
              var theQuote = "'";
              var theParcels = results.features  //selected parcels
              for (var index in theParcels) {
                if (index==0) {
                 temp += theQuote + theParcels[index].attributes.TaxParcelNumber + theQuote ;
                } else {
                 temp += ", " + theQuote + theParcels[index].attributes.TaxParcelNumber + theQuote ;
                }
              }
              newWhereClause.resolve("TaxParcelNumber IN (" + temp + ")");  //resolve deferred - new list of parcels within the original parcel(s) buffer for where clause
            }), function(error){ //lang.hitch
              console.log(error);  //error message for this.qtParcelQuery.execute (second time)
            });  //end parcel buffer query

          }), function(error){ //lang.hitch
            console.log(error);  //error message for this.localGeometryService.buffer
          });  //end parcel buffer
            
        }), function(error){ //lang.hitch
          console.log(error);  //error message for this.qtParcelQuery.execute (first time)
        });  //end query for parcel geometry

        return newWhereClause;  //deferred
      }

    //END MJM mailing label functions here ------------------------------------------------------      

    });
  });