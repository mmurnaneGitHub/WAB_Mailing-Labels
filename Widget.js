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
    'dojo/on',
    'dojo/query',
    'dojo/Deferred',
    'dojo/_base/lang',
    'dojo/_base/html',
    'dojo/_base/array',
    'dojo/promise/all',
    'dojo/_base/declare',
    'dijit/_WidgetsInTemplateMixin',
    'jimu/utils',
    'jimu/BaseWidget',
    'jimu/CSVUtils', //MJM
    'esri/tasks/query', //MJM
    'esri/tasks/QueryTask', //MJM
    'jimu/MapManager',
    'jimu/filterUtils',
    'jimu/dijit/Message',
    'jimu/symbolUtils',
    'esri/lang',
    'esri/request',
    'esri/symbols/jsonUtils',
    'esri/layers/FeatureLayer',
    'esri/dijit/PopupTemplate',
    'esri/renderers/SimpleRenderer',
    './TaskSetting',
    './SingleQueryLoader',
    './SingleQueryResult',
    './utils',
    'jimu/LayerInfos/LayerInfos',
    'jimu/dijit/LoadingShelter',
    'dijit/form/Select'
  ],
  function(on, query, Deferred, lang, html, array, all, declare, _WidgetsInTemplateMixin, jimuUtils, BaseWidget,
    CSVUtils, EsriQuery, QueryTask,
    MapManager, FilterUtils, Message, jimuSymUtils, esriLang, esriRequest, symbolJsonUtils, FeatureLayer, PopupTemplate,
    SimpleRenderer, TaskSetting, SingleQueryLoader, SingleQueryResult, queryUtils, LayerInfos) {

    return declare([BaseWidget, _WidgetsInTemplateMixin], {
      name: 'Query',
      baseClass: 'jimu-widget-query',
      currentTaskSetting: null,
      hiddenClass: "not-visible",
      _resultLayerInfos: null, //[{value,label,taskIndex,singleQueryResult}]
      mapManager: null,
      layerInfosObj: null,
      labelTasks: '',
      labelResults: '',

      /*

      popupInfo -> popupTempalte -> PopupRenderer

      test:
      http://map.floridadisaster.org/GIS/rest/services/Events/FL511_Feeds/MapServer/4
      http://maps.usu.edu/ArcGIS/rest/services/MudLake/MudLakeMonitoringSites/MapServer/0
      http://sampleserver6.arcgisonline.com/arcgis/rest/services/USA/MapServer/0
      1. if queryType is 1, it means that the query supports OrderBy and Pagination.
         such as: http://services2.arcgis.com/K1Xet5rYYN1SOWtq/ArcGIS/rest/services/
         USA_hostingFS/FeatureServer/0
      2. if queryType is 2, it means that the query supports objectIds, but
         doesn't support OrderBy or Pagination.
         such as: http://sampleserver6.arcgisonline.com/arcgis/rest/services/USA/MapServer
      3. if queryType is 3, it means that the query doesn't support objectIds.
      */

      postMixInProperties: function() {
        this.inherited(arguments);
        this.layerInfosObj = LayerInfos.getInstanceSync();
        this.mapManager = MapManager.getInstance();
        this._resultLayerInfos = [];
        var strClearResults = this.nls.clearResults;
        var tip = esriLang.substitute({
          clearResults: strClearResults
        }, this.nls.operationalTip);
        this.nls.operationalTip = tip;
        this.labelTasks = this.nls.tasks;
        this.labelResults = this.nls.queryResults;
        this._setUrlForConfig();
        if (this.config) {
          this.config = queryUtils.getConfigWithValidDataSource(this.config);
          this._updateConfig();
          if (this.config.labelTasks) {
            this.labelTasks = this.config.labelTasks;
          }
          if (this.config.labelResults) {
            this.labelResults = this.config.labelResults;
          }
        }
      },

      _updateConfig: function() {
        if (this.config && this.config.queries && this.config.queries.length > 0) {
          array.forEach(this.config.queries, lang.hitch(this, function(singleConfig) {
            this._rebuildFilter(singleConfig.url, singleConfig.filter);
          }));
        }
      },

      _setUrlForConfig: function() {
        //set url attribute of config if webMapLayerId is set
        if (this.config && this.config.queries && this.config.queries.length > 0) {
          array.forEach(this.config.queries, lang.hitch(this, function(singleConfig) {
            if (singleConfig.webMapLayerId) {
              var layerInfoOrTableInfo = this.layerInfosObj.getLayerOrTableInfoById(singleConfig.webMapLayerId);
              if (layerInfoOrTableInfo) {
                singleConfig.url = layerInfoOrTableInfo.getUrl();
              }
            }
          }));
        }
      },

      _rebuildFilter: function(url, filter) {
        try {
          if (filter) {
            delete filter.expr;
            var filterUtils = new FilterUtils();
            filterUtils.isHosted = jimuUtils.isHostedService(url);
            filterUtils.getExprByFilterObj(filter);
          }
        } catch (e) {
          console.log(e);
        }
      },

      postCreate: function() {
        this.inherited(arguments);
        this._initSelf();
        this._updateResultDetailUI();
        var trs = query('.single-task', this.tasksTbody);
        if (trs.length === 1) {
          html.addClass(this.domNode, 'only-one-task');
          this._showTaskSettingPane();
          this._onClickTaskTr(trs[0]);
        }
        //MJM - Mailing Labels -----------------------------------------------------
        //need query (EsriQuery) & QueryTask
        //GROUPACCOUNT PARCELS
        this.qtMailingLabelsGroupAccount = new QueryTask("https://arcgisprod02.tacoma.lcl/arcgis/rest/services/PDS/MailingLabels/MapServer/2");
        this.qMailingLabelsGroupAccount = new EsriQuery();
        this.qMailingLabelsGroupAccount.returnGeometry = false;
        this.qMailingLabelsGroupAccount.outFields = ["Taxpayer.TAXPAYERNAME", "Taxpayer.CAREOF", "Taxpayer.TAXPAYERADDRESS", "Taxpayer.TAXPAYERCITY", "Taxpayer.TAXPAYERSTATE", "Taxpayer.TAXPAYERZIPCODE"];

        //OCCUPANT - ADDRESS POINTS
        this.qtMailingLabelsOccupants = new QueryTask("https://arcgisprod02.tacoma.lcl/arcgis/rest/services/PDS/MailingLabels/MapServer/0");
        this.qMailingLabelsOccupants = new EsriQuery();
        this.qMailingLabelsOccupants.returnGeometry = false;
        this.qMailingLabelsOccupants.outFields = ["*"];
        //Set global variable for current task index - varies by order user performs tasks
        var currentTaskIndex;
        //end Mailing Labels--------------------------------------------------
      },

      onOpen: function() {
        var info = this._getCurrentResultLayerInfo();
        var singleQueryResult = info && info.singleQueryResult;
        if (singleQueryResult) {
          singleQueryResult.showLayer();
        }
        this._showTempLayers();
        this.inherited(arguments);
      },

      onActive: function() {
        //this.map.setInfoWindowOnClick(false);
        // this.mapManager.disableWebMapPopup();
        this._showTempLayers();
      },

      onDeActive: function() {
        //deactivate method of DrawBox dijit will call this.map.setInfoWindowOnClick(true) inside
        // this.drawBox.deactivate();
        if (this.currentTaskSetting) {
          this.currentTaskSetting.deactivate();
        }
        this.mapManager.enableWebMapPopup();
        this._hideTempLayers();
      },

      onClose: function() {
        if (this.config.hideLayersAfterWidgetClosed) {
          this._hideAllLayers();
        }
        this._hideInfoWindow();
        this._hideTempLayers();
        this.inherited(arguments);
      },

      destroy: function() {
        this._hideInfoWindow();
        this._removeResultLayerInfos(this._resultLayerInfos);
        this.inherited(arguments);
      },

      _hideTempLayers: function() {
        if (this.currentTaskSetting) {
          this.currentTaskSetting.hideTempLayers();
        }
      },

      _showTempLayers: function() {
        if (this.currentTaskSetting) {
          this.currentTaskSetting.showTempLayers();
        }
      },

      _initSelf: function() {
        var queries = this.config.queries;

        if (queries.length === 0) {
          html.setStyle(this.tasksNode, 'display', 'none');
          html.setStyle(this.noQueryTipSection, 'display', 'block');
          return;
        }

        //create query tasks
        array.forEach(queries, lang.hitch(this, function(singleConfig, index) {
          var defaultIcon = this.folderUrl + "css/images/default_task_icon.png";
          queryUtils.dynamicUpdateConfigIcon(singleConfig, defaultIcon);
          var name = singleConfig.name;
          var strTr = '<tr class="single-task">' +
            '<td class="first-td"><span class="task-icon"></span></td>' +
            '<td class="second-td">' +
            '<div class="list-item-name task-name-div"></div>' +
            '</td>' +
            '</tr>';
          var tr = html.toDom(strTr);
          var queryNameDiv = query(".task-name-div", tr)[0];
          queryNameDiv.innerHTML = name;
          html.place(tr, this.tasksTbody);

          var iconNode = query("span.task-icon", tr)[0];
          var icon = singleConfig.icon;

          if (icon) {
            var size = 16;
            var symbolNodeStyle = null;
            var isImgType = icon.url || icon.imageData;

            if (isImgType) {
              icon.setWidth(size);
              icon.setHeight(size);
            } else {
              symbolNodeStyle = {
                width: size + 1,
                height: size + 1
              };
              icon.setSize(size);
            }

            var symbolNode = jimuSymUtils.createSymbolNode(icon, symbolNodeStyle);
            html.place(symbolNode, iconNode);
          }

          tr.taskIndex = index;
          tr.singleConfig = singleConfig;
          if (index % 2 === 0) {
            html.addClass(tr, 'even');
          } else {
            html.addClass(tr, 'odd');
          }
        }));
      },

      _onTabHeaderClicked: function(event) {
        var target = event.target || event.srcElement;
        if (target === this.taskQueryItem) {
          var currentResultLayerInfo = this._getCurrentResultLayerInfo();
          if (currentResultLayerInfo) {
            var singleQueryResult = currentResultLayerInfo.singleQueryResult;
            if (singleQueryResult) {
              if (singleQueryResult.singleRelatedRecordsResult || singleQueryResult.multipleRelatedRecordsResult) {
                singleQueryResult._showFeaturesResultDiv();
              }
            }
          }
          this._switchToTaskTab();
        } else if (target === this.resultQueryItem) {
          this._switchToResultTab();
        }
      },

      _switchToTaskTab: function() {
        html.removeClass(this.resultQueryItem, 'selected');
        html.removeClass(this.resultTabView, 'selected');
        html.addClass(this.taskQueryItem, 'selected');
        html.addClass(this.taskTabView, 'selected');
      },

      _switchToResultTab: function() {
        this._updateResultDetailUI();
        html.removeClass(this.taskQueryItem, 'selected');
        html.removeClass(this.taskTabView, 'selected');
        html.addClass(this.resultQueryItem, 'selected');
        html.addClass(this.resultTabView, 'selected');
      },

      _updateResultDetailUI: function() {
        if (this._resultLayerInfos.length > 0) {
          html.removeClass(this.resultSection, this.hiddenClass);
          html.addClass(this.noresultSection, this.hiddenClass);
        } else {
          html.addClass(this.resultSection, this.hiddenClass);
          html.removeClass(this.noresultSection, this.hiddenClass);
        }
      },

      _showTaskListPane: function() {
        this._switchToTaskTab();
        html.setStyle(this.taskList, 'display', 'block');
        html.setStyle(this.taskSettingContainer, 'display', 'none');
      },

      _showTaskSettingPane: function() {
        this._switchToTaskTab();
        html.setStyle(this.taskList, 'display', 'none');
        html.setStyle(this.taskSettingContainer, 'display', 'block');
      },

      /*------------------------------task list------------------------------------*/

      _onTaskListClicked: function(event) {
        var target = event.target || event.srcElement;
        var tr = jimuUtils.getAncestorDom(target, lang.hitch(this, function(dom) {
          return html.hasClass(dom, 'single-task');
        }), 10);

        if (!tr) {
          return;
        }

        this._onClickTaskTr(tr);
      },

      _onClickTaskTr: function(tr) {
        //this._getLayerInfoAndServiceInfo(tr).then(lang.hitch(this, function(response){
        this._getLayerInfoAndRelationshipLayerInfos(tr).then(lang.hitch(this, function(response) {
          var layerInfo = response.layerInfo;
          //var serviceInfo = response.serviceInfo;
          var relationshipLayerInfos = response.relationshipLayerInfos;
          var relationshipPopupTemplates = response.relationshipPopupTemplates;
          tr.singleConfig.objectIdField = jimuUtils.getObjectIdField(layerInfo);
          var popupInfo = this._getPopupInfo(layerInfo, tr.singleConfig);
          if (!popupInfo) {
            console.error("can't get popupInfo");
          }
          popupInfo.fieldInfos = queryUtils.getPortalFieldInfosWithoutShape(layerInfo, popupInfo.fieldInfos);
          delete popupInfo.readFromWebMap;
          //now we get all layerDefinitions and popupInfos
          //we prepare currentAttrs here
          var currentAttrs = SingleQueryLoader.getCleanCurrentAttrsTemplate();
          currentAttrs.queryTr = tr;
          currentAttrs.config = lang.clone(tr.singleConfig);
          currentAttrs.config.popupInfo = popupInfo; //add popupInfo attribute
          currentAttrs.layerInfo = layerInfo;
          //currentAttrs.serviceInfo = serviceInfo;
          currentAttrs.relationshipLayerInfos = relationshipLayerInfos;
          currentAttrs.relationshipPopupTemplates = relationshipPopupTemplates;
          currentAttrs.query.maxRecordCount = layerInfo.maxRecordCount || 1000;

          currentAttrs.queryType = queryUtils.getQueryType(layerInfo);

          //after get currentAttrs, we can show task setting pane destroy the old TaskSetting dijit and create a new one
          if (this.currentTaskSetting) {
            this.currentTaskSetting.destroy();
          }
          this.currentTaskSetting = null;
          this._showTaskSettingPane();
          this.currentTaskSetting = new TaskSetting({
            nls: this.nls,
            map: this.map,
            currentAttrs: currentAttrs,
            layerInfosObj: this.layerInfosObj,
            onBack: lang.hitch(this, function() {
              this._showTaskListPane();
            }),
            onApply: lang.hitch(this, function(currentAttrs) {
              this._onBtnApplyClicked(currentAttrs);
            })
          });

          if (this.currentTaskSetting.canAutoRunning()) {
            this._switchToResultTab();
            //if the task can run without specify other parameters, then we run it automatically
            this.currentTaskSetting.run();
          }

          this.currentTaskSetting.placeAt(this.taskSettingContainer);

          //MJM Mailing Labels - Do when When Task options section is shown in panel
          if (currentAttrs.config.name.indexOf('Select by Parcel Number') !== -1) { //two tasks possible - DOM rebuilt on each task click, so remove each time (can't use includes with IE)
            //Configure widget task to have both of the following options:
            //* Only return features that intersect with the shape drawn on the map (set default buffer distance to 1,000')
            //* Return features within full extent of the map (set as default)
            //  ... and now hide/show elements below
            setTimeout(myLittleHack, 300); //page is not finished rendering, so wait for it 
            function myLittleHack() {
              document.getElementsByClassName('dijitSelect')[0].style.display = 'none'; //hide draw tools
              document.getElementsByClassName('jimu-draw-box')[0].style.display = 'none'; //hide spatial filter menu
              document.getElementsByClassName('drawing-section')[0].style.display = 'block'; //show the buffer distance section
            }
          };
          //end MJM




        }), lang.hitch(this, function(err) {
          console.error("can't get layerInfo", err);

        }));
      },

      _getLayerInfoAndServiceInfo: function(tr) {
        var def = new Deferred();
        var layerDef = this._getLayerInfo(tr);
        var serviceDef = this._getServiceInfo(tr);
        this.shelter.show();
        all([layerDef, serviceDef]).then(lang.hitch(this, function(results) {
          if (!this.domNode) {
            return;
          }
          this.shelter.hide();
          tr.layerInfo = results[0];
          tr.serviceInfo = results[1];
          def.resolve({
            layerInfo: tr.layerInfo,
            serviceInfo: tr.serviceInfo
          });
        }), lang.hitch(this, function(err) {
          console.error(err);
          if (!this.domNode) {
            return;
          }
          this.shelter.hide();
          var errMsg = "";
          if (err && err.httpCode === 403) {
            errMsg = this.nls.noPermissionsMsg;
          }
          this._showQueryErrorMsg(errMsg);
          def.reject();
        }));
        return def;
      },

      _getLayerInfoAndRelationshipLayerInfos: function(tr) {
        var def = new Deferred();
        this.shelter.show();
        var layerDef = this._getLayerInfo(tr);
        layerDef.then(lang.hitch(this, function(layerInfo) {
          tr.layerInfo = layerInfo;
          this._getRelationshipLayerInfos(tr).then(lang.hitch(this, function(relationshipLayerInfos) {
            if (!this.domNode) {
              return;
            }

            tr.relationshipLayerInfos = relationshipLayerInfos;
            var relationshipPopupTemplates = {};
            var webMapItemData = this.map.itemInfo.itemData;

            var baseServiceUrl = tr.singleConfig.url.replace(/\d*\/*$/g, '');

            for (var layerId in relationshipLayerInfos) {
              var layerDefinition = relationshipLayerInfos[layerId];
              //var popupInfo = queryUtils.getDefaultPopupInfo(layerDefinition, false, true);
              var layerUrl = baseServiceUrl + layerId;
              var popupInfo = queryUtils.getPopupInfoForRelatedLayer(webMapItemData, layerUrl, layerDefinition);
              relationshipPopupTemplates[layerId] = new PopupTemplate(popupInfo);
            }
            this.shelter.hide();
            def.resolve({
              layerInfo: layerInfo,
              relationshipLayerInfos: relationshipLayerInfos,
              relationshipPopupTemplates: relationshipPopupTemplates
            });
          }), lang.hitch(this, function(err) {
            if (!this.domNode) {
              return;
            }
            this.shelter.hide();
            def.reject(err);
          }));
        }), lang.hitch(this, function(err) {
          if (!this.domNode) {
            return;
          }
          this.shelter.hide();
          def.reject(err);
        }));
        return def;
      },

      //get layer definition
      _getLayerInfo: function(tr) {
        var def = new Deferred();
        if (tr.layerInfo) {
          def.resolve(tr.layerInfo);
        } else {
          var layerUrl = tr.singleConfig.url;
          esriRequest({
            url: layerUrl,
            content: {
              f: 'json'
            },
            handleAs: 'json',
            callbackParamName: 'callback'
          }).then(lang.hitch(this, function(layerInfo) {
            tr.layerInfo = layerInfo;
            def.resolve(layerInfo);
          }), lang.hitch(this, function(err) {
            def.reject(err);
          }));
        }
        return def;
      },

      //get meta data of MapServer or FeatureServer
      _getServiceInfo: function(tr) {
        var def = new Deferred();
        if (tr.serviceInfo) {
          def.resolve(tr.serviceInfo);
        } else {
          var layerUrl = tr.singleConfig.url;
          var serviceUrl = this._getServiceUrlByLayerUrl(layerUrl);
          esriRequest({
            url: serviceUrl,
            content: {
              f: 'json'
            },
            handleAs: 'json',
            callbackParamName: 'callback'
          }).then(lang.hitch(this, function(serviceInfo) {
            tr.serviceInfo = serviceInfo;
            def.resolve(serviceInfo);
          }), lang.hitch(this, function(err) {
            def.reject(err);
          }));
        }
        return def;
      },

      //get relationship layers definition
      _getRelationshipLayerInfos: function(tr) {
        var def = new Deferred();
        if (tr.relationshipLayerInfos) {
          def.resolve(tr.relationshipLayerInfos);
        } else {
          var layerInfo = tr.layerInfo;
          var relationships = layerInfo.relationships;
          if (relationships && relationships.length > 0) {
            var layerUrl = tr.singleConfig.url;
            var serviceUrl = this._getServiceUrlByLayerUrl(layerUrl);
            var defs = array.map(relationships, lang.hitch(this, function(relationship) {
              var url = serviceUrl + "/" + relationship.relatedTableId;
              return esriRequest({
                url: url,
                content: {
                  f: 'json'
                },
                handleAs: 'json',
                callbackParamName: 'callback'
              });
            }));
            all(defs).then(lang.hitch(this, function(results) {
              tr.relationshipLayerInfos = {};
              array.forEach(relationships, lang.hitch(this, function(relationship, index) {
                tr.relationshipLayerInfos[relationship.relatedTableId] = results[index];
              }));
              def.resolve(tr.relationshipLayerInfos);
            }), lang.hitch(this, function(err) {
              tr.relationshipLayerInfos = null;
              def.reject(err);
            }));
          } else {
            tr.relationshipLayerInfos = {};
            def.resolve(tr.relationshipLayerInfos);
          }
        }
        return def;
      },

      _getServiceUrlByLayerUrl: function(layerUrl) {
        var lastIndex = layerUrl.lastIndexOf("/");
        var serviceUrl = layerUrl.slice(0, lastIndex);
        return serviceUrl;
      },

      _getPopupInfo: function(layerDefinition, config) {
        var result = null;
        var defaultPopupInfo = queryUtils.getDefaultPopupInfo(layerDefinition, false, false);
        result = defaultPopupInfo;
        var popupInfo = null;
        if (config.popupInfo) {
          //new query
          if (config.popupInfo.readFromWebMap) {
            if (config.webMapLayerId) {
              var layerInfo = null;
              if (queryUtils.isTable(layerDefinition)) {
                layerInfo = this.layerInfosObj.getTableInfoById(config.webMapLayerId);
              } else {
                layerInfo = this.layerInfosObj.getLayerInfoById(config.webMapLayerId);
              }
              if (layerInfo) {
                popupInfo = layerInfo.getPopupInfo();
                if (popupInfo) {
                  popupInfo = lang.clone(popupInfo);
                  result = popupInfo;
                } else {
                  result = defaultPopupInfo;
                }
              } else {
                result = defaultPopupInfo;
              }
            } else {
              result = defaultPopupInfo;
            }
          } else {
            //custom popup info
            popupInfo = lang.clone(config.popupInfo);
            delete popupInfo.readFromWebMap;
            result = popupInfo;
          }
        } else if (config.popup) {
          //old query, update old config.popup to new config.popupInfo
          result = queryUtils.upgradePopupToPopupInfo(layerDefinition, config.popup);
        } else {
          result = defaultPopupInfo;
        }

        if (!result) {
          result = defaultPopupInfo;
        }

        result.showAttachments = !!layerDefinition.hasAttachments;

        queryUtils.removePopupInfoUnsupportFields(layerDefinition, result);

        return result;
      },

      /*------------------------------task list------------------------------------*/

      //start to query
      _onBtnApplyClicked: function(currentAttrs) {
        //we should enable web map popup here
        this.mapManager.enableWebMapPopup();

        html.addClass(this.resultTabView, this.hiddenClass);

        //set query.resultLayer
        var singleResultLayer = currentAttrs.config.singleResultLayer;
        if (singleResultLayer) {
          var taskIndex = currentAttrs.queryTr.taskIndex;
          var taskOptions = this._getResultLayerInfosByTaskIndex(taskIndex);
          if (taskOptions.length > 0) {
            //When SingleQueryResult is destroyed, the related feature layer is removed
            this._removeResultLayerInfos(taskOptions);
          }
        }

        var queryName = this._getBestQueryName(currentAttrs.config.name || '');
        queryName = jimuUtils.sanitizeHTML(queryName);
        this._createNewResultLayer(currentAttrs, queryName);

        this.shelter.show();

        var singleQueryResult = new SingleQueryResult({
          map: this.map,
          nls: this.nls,
          label: queryName,
          currentAttrs: currentAttrs,
          queryWidget: this,
          onBack: lang.hitch(this, function() {
            this._switchToResultTab();
          })
        });
        this.own(on(singleQueryResult, 'show-related-records', lang.hitch(this, this._onShowRelatedRecords)));
        this.own(on(singleQueryResult, 'hide-related-records', lang.hitch(this, this._onHideRelatedRecords)));
        this.own(on(singleQueryResult, 'features-update', lang.hitch(this, this._onFeaturesUpdate)));
        //we should put singleQueryResult into the dom tree when _onSingleQueryFinished is called
        //singleQueryResult.placeAt(this.singleResultDetails);

        singleQueryResult.executeQueryForFirstTime().then(lang.hitch(this, function( /*allCount*/ ) {
          if (!this.domNode) {
            return;
          }
          this.shelter.hide();
          html.removeClass(this.resultTabView, this.hiddenClass);
          // if(allCount > 0){
          //   this._onSingleQueryFinished(singleQueryResult, queryName);
          // }
          this._onSingleQueryFinished(singleQueryResult, queryName);
          this._updateResultDetailUI();
        }), lang.hitch(this, function(err) {
          console.error(err);
          if (!this.domNode) {
            return;
          }
          this.shelter.hide();
          html.removeClass(this.resultTabView, this.hiddenClass);
        }));
      },

      _getBestQueryName: function(queryName) {
        if (queryName) {
          queryName += " _" + this.nls.queryResult;
        } else {
          queryName += this.nls.queryResult;
        }
        var finalName = queryName;
        var allNames = array.map(this.map.graphicsLayerIds, lang.hitch(this, function(glId) {
          var layer = this.map.getLayer(glId);
          return layer.name;
        }));
        var flag = 2;
        while (array.indexOf(allNames, finalName) >= 0) {
          finalName = queryName + '_' + flag;
          flag++;
        }
        return finalName;
      },

      //create a FeatureLayer
      _createNewResultLayer: function(currentAttrs, queryName) {
        var resultLayer = null;
        var renderer = null;
        var taskIndex = currentAttrs.queryTr.taskIndex;

        var layerInfo = lang.clone(currentAttrs.layerInfo);

        //override layerInfo
        layerInfo.name = queryName;
        //ImageServiceLayer doesn't have drawingInfo
        if (!layerInfo.drawingInfo) {
          layerInfo.drawingInfo = {};
        }

        layerInfo.drawingInfo.transparency = 0;
        layerInfo.minScale = 0;
        layerInfo.maxScale = 0;
        layerInfo.effectiveMinScale = 0;
        layerInfo.effectiveMaxScale = 0;
        layerInfo.defaultVisibility = true;
        delete layerInfo.extent;

        //only keep necessary fields
        var singleQueryLoader = new SingleQueryLoader(this.map, currentAttrs);
        var necessaryFieldNames = singleQueryLoader.getOutputFields();
        layerInfo.fields = array.filter(layerInfo.fields, lang.hitch(this, function(fieldInfo) {
          return necessaryFieldNames.indexOf(fieldInfo.name) >= 0;
        }));
        var featureCollection = {
          layerDefinition: layerInfo,
          featureSet: null
        };

        //For now, we should not add the FeatureLayer into map.
        resultLayer = new FeatureLayer(featureCollection);
        //set taskIndex for resutlLayer
        resultLayer._queryWidgetTaskIndex = taskIndex;
        //set popupTemplate
        var popupInfo = lang.clone(currentAttrs.config.popupInfo);
        var popupTemplate = new PopupTemplate(popupInfo);
        if (popupInfo.showAttachments) {
          var url = currentAttrs.config.url;
          var objectIdField = currentAttrs.config.objectIdField;
          queryUtils.overridePopupTemplateMethodGetAttachments(popupTemplate, url, objectIdField);
        }
        resultLayer.setInfoTemplate(popupTemplate);

        currentAttrs.query.resultLayer = resultLayer;

        //set renderer
        //if the layer is a table, resultsSymbol will be null
        if (!queryUtils.isTable(currentAttrs.layerInfo)) {
          if (!currentAttrs.config.useLayerSymbol && currentAttrs.config.resultsSymbol) {
            var symbol = symbolJsonUtils.fromJson(currentAttrs.config.resultsSymbol);
            renderer = new SimpleRenderer(symbol);
            resultLayer.setRenderer(renderer);
          }
        }

        return resultLayer;
      },

      /*---------------------------query result list-------------------------------*/

      _onSingleQueryFinished: function(singleQueryResult, queryName) {
        this.currentTaskSetting.onGetQueryResponse();
        singleQueryResult.placeAt(this.singleResultDetails);
        this._hideAllSingleQueryResultDijits();
        this._switchToResultTab();
        html.setStyle(singleQueryResult.domNode, 'display', 'block');
        var currentAttrs = singleQueryResult.getCurrentAttrs();
        var taskIndex = currentAttrs.queryTr.taskIndex;

        var resultLayerInfo = {
          value: jimuUtils.getRandomString(),
          label: queryName,
          taskIndex: taskIndex,
          singleQueryResult: singleQueryResult
        };

        this._resultLayerInfos.push(resultLayerInfo);

        this.resultLayersSelect.addOption({
          value: resultLayerInfo.value,
          label: resultLayerInfo.label
        });
        this.resultLayersSelect.set('value', resultLayerInfo.value);

        this._showResultLayerInfo(resultLayerInfo);

        this._updateResultDetailUI();

        this._MailingLabelsStart(singleQueryResult, queryName, taskIndex); //MJM - START MAILING LABELS!!!!!
        //console.error(singleQueryResult, ' - ', queryName, ' - ',  taskIndex);

      },

      _onResultLayerSelectChanged: function() {
        var resultLayerInfo = this._getCurrentResultLayerInfo();
        if (resultLayerInfo) {
          this._showResultLayerInfo(resultLayerInfo);
        }
      },

      _getCurrentResultLayerInfo: function() {
        var resultLayerInfo = null;
        var value = this.resultLayersSelect.get('value');
        if (value) {
          resultLayerInfo = this._getResultLayerInfoByValue(value);
        }
        return resultLayerInfo;
      },

      _hideAllLayers: function( /*optional*/ ignoredSingleQueryResult) {
        var dijits = this._getAllSingleQueryResultDijits();
        array.forEach(dijits, lang.hitch(this, function(singleQueryResult) {
          if (singleQueryResult && singleQueryResult !== ignoredSingleQueryResult) {
            singleQueryResult.hideLayer();
          }
        }));
      },

      _removeResultLayerInfosByTaskIndex: function(taskIndex) {
        var resultLayerInfos = this._getResultLayerInfosByTaskIndex(taskIndex);
        this._removeResultLayerInfos(resultLayerInfos);
      },

      _getResultLayerInfoByValue: function(value) {
        var resultLayerInfo = null;
        array.some(this._resultLayerInfos, lang.hitch(this, function(item) {
          if (item.value === value) {
            resultLayerInfo = item;
            return true;
          } else {
            return false;
          }
        }));
        return resultLayerInfo;
      },

      _getResultLayerInfosByTaskIndex: function(taskIndex) {
        var resultLayerInfos = this._resultLayerInfos;
        resultLayerInfos = array.filter(resultLayerInfos, lang.hitch(this, function(resultLayerInfo) {
          return resultLayerInfo.taskIndex === taskIndex;
        }));
        return resultLayerInfos;
      },

      _removeResultLayerInfoByValues: function(values) {
        var indexArray = [];
        array.forEach(this._resultLayerInfos, lang.hitch(this, function(resultLayerInfo, index) {
          if (values.indexOf(resultLayerInfo.value) >= 0) {
            indexArray.push(index);
            if (resultLayerInfo.singleQueryResult && resultLayerInfo.singleQueryResult.domNode) {
              resultLayerInfo.singleQueryResult.destroy();
            }
            resultLayerInfo.singleQueryResult = null;
          }
        }));
        indexArray.reverse();
        array.forEach(indexArray, lang.hitch(this, function(index) {
          this._resultLayerInfos.splice(index, 1);
        }));
        this.resultLayersSelect.removeOption(values);

        var options = this.resultLayersSelect.getOptions();
        if (options && options.length > 0) {
          this.resultLayersSelect.set('value', options[0].value);
        } else {
          if (typeof this.resultLayersSelect._setDisplay === "function") {
            this.resultLayersSelect._setDisplay("");
          }
        }

        this._updateResultDetailUI();
      },

      _removeResultLayerInfos: function(resultLayerInfos) {
        var values = array.map(resultLayerInfos, lang.hitch(this, function(resultLayerInfo) {
          return resultLayerInfo.value;
        }));
        return this._removeResultLayerInfoByValues(values);
      },

      _getAllSingleQueryResultDijits: function() {
        var dijits = [];

        if (this._resultLayerInfos && this._resultLayerInfos.length > 0) {
          array.forEach(this._resultLayerInfos, lang.hitch(this, function(resultLayerInfo) {
            if (resultLayerInfo && resultLayerInfo.singleQueryResult) {
              dijits.push(resultLayerInfo.singleQueryResult);
            }
          }));
        }

        return dijits;
      },

      _hideAllSingleQueryResultDijits: function() {
        var dijits = this._getAllSingleQueryResultDijits();
        array.forEach(dijits, lang.hitch(this, function(dijit) {
          html.setStyle(dijit.domNode, 'display', 'none');
        }));
      },

      _showResultLayerInfo: function(resultLayerInfo) {
        this._hideAllSingleQueryResultDijits();
        var singleQueryResult = resultLayerInfo.singleQueryResult;
        this._hideAllLayers(singleQueryResult);
        if (singleQueryResult) {
          html.setStyle(singleQueryResult.domNode, 'display', 'block');
          singleQueryResult.showLayer();
          singleQueryResult.zoomToLayer();
        }
      },

      removeSingleQueryResult: function(singleQueryResult) {
        var value = null;
        array.some(this._resultLayerInfos, lang.hitch(this, function(resultLayerInfo) {
          if (resultLayerInfo.singleQueryResult === singleQueryResult) {
            value = resultLayerInfo.value;
            return true;
          } else {
            return false;
          }
        }));
        if (value !== null) {
          this._removeResultLayerInfoByValues([value]);
        }
      },

      _onShowRelatedRecords: function() {
        html.addClass(this.resultLayersSelectDiv, this.hiddenClass);
      },

      _onHideRelatedRecords: function() {
        html.removeClass(this.resultLayersSelectDiv, this.hiddenClass);
      },

      _onFeaturesUpdate: function(args) {
        var taskIndex = args.taskIndex;
        var features = args.features;
        try {
          this.updateDataSourceData(taskIndex, {
            features: features
          });
        } catch (e) {
          console.error(e);
        }
      },

      /*-------------------------common functions----------------------------------*/

      _isImageServiceLayer: function(url) {
        return (url.indexOf('/ImageServer') > -1);
      },

      _showQueryErrorMsg: function( /* optional */ msg) {
        new Message({
          message: msg || this.nls.queryError
        });
      },

      _hideInfoWindow: function() {
        if (this.map && this.map.infoWindow) {
          this.map.infoWindow.hide();
          if (typeof this.map.infoWindow.setFeatures === 'function') {
            this.map.infoWindow.setFeatures([]);
          }
        }
      },

      //MJM - START Mailing Label functions------------------------------------------------------
      _MailingLabelsStart: function(singleQueryResult, queryName, taskIndex) {
        this.currentTaskIndex = taskIndex; //Update current task index for Mailing Label button placement
        var currentFields = singleQueryResult.currentAttrs.query.resultLayer.fields; //field names and aliases
        var currentResults = singleQueryResult.currentAttrs.query.resultLayer.graphics; //selected records results - graphics Array
        var currentAliases = this._MailingLabels_formatAliases(currentFields); //get results field aliases 

        if (currentResults.length > 0 && queryName.search('Occupant Only') != -1) {
          //Javascript 'includes' works in Chrome, but not IE - used search('Taxpayer')!=-1 instead
          //OCCUPANT ONLY RECORDS---------------------------------------------------------------------------
          var unique_array_Occupants = this._MailingLabels_format4CSV(currentResults, currentAliases); //Unique occupants - format for CSV with alias fields and duplicates removed (probably all unique)
          unique_array_Occupants.forEach(function(n) {
            n.Name = 'Occupant'
          }); //Add name field = Occupant -  Name: Occupant to array 
          this._MailingLabels_createButton(unique_array_Occupants); //Create 'Mailing Labels' button for unique occupants

        } else if (currentResults.length > 0 && queryName.search('Taxpayer') != -1) {
          //Unique taxpayers - format for CSV with alias fields and duplicates removed
          var unique_array_Taxpayer = this._MailingLabels_format4CSV(currentResults, currentAliases);

          if (queryName.search('Occupant') != -1) {
            //Combine taxpayers, occupants, & group accounts
            var theOccupants = this._MailingLabels_UniqueOccupants(currentResults); //Deferred to find occupants [0]
            var theGroupaccounts = this._MailingLabels_UniqueGroupaccounts(currentResults); //Deferred to find groupaccount parcels [1]
            promises = all([theOccupants, theGroupaccounts]); //Use Promises so all arrays are done & current before using - https://developers.arcgis.com/javascript/3/jssamples/query_deferred_list.html
            promises.then(lang.hitch(this, function(results) {
              var array_Occupants_Taxpayer_Groupaccount = results[0].concat(unique_array_Taxpayer, results[1]); // Merges arrays  
              var unique_array_Occupants_Taxpayer_Groupaccount = this._MailingLabels_format4CSV_noDups(array_Occupants_Taxpayer_Groupaccount); //Remove duplicates
              //Create 'Mailing Labels' button that opens results as a CSV file   (see 'Export to CSV file' function - ..\jimu.js\CSVUtils.js)
              this._MailingLabels_createButton(unique_array_Occupants_Taxpayer_Groupaccount);
            }), function(error) { //lang.hitch
              console.log(error); //error message
            }); //end deferred
          } else {
            //Combine taxpayers & group accounts
            var theGroupaccounts = this._MailingLabels_UniqueGroupaccounts(currentResults); //Deferred to find groupaccount parcels [0]
            promises = all([theGroupaccounts]); //Use Promises so all arrays are done & current before using - https://developers.arcgis.com/javascript/3/jssamples/query_deferred_list.html
            promises.then(lang.hitch(this, function(results) {
              var array_Taxpayer_Groupaccount = results[0].concat(unique_array_Taxpayer); // Merges arrays  
              var unique_array_Taxpayer_Groupaccount = this._MailingLabels_format4CSV_noDups(array_Taxpayer_Groupaccount); //Remove duplicates
              //Create 'Mailing Labels' button that opens results as a CSV file   (see 'Export to CSV file' function - ..\jimu.js\CSVUtils.js)
              this._MailingLabels_createButton(unique_array_Taxpayer_Groupaccount);
            }), function(error) { //lang.hitch
              console.log(error); //error message
            }); //end deferred

          } //end 'Occupant' check

        } //end if 'Select: Taxpayer'

      },

      _MailingLabels_UniqueOccupants: function(currentResults) {
        //Taxpayer & Occupant selected - use selected unique parcel numbers to select address points
        //Assumption: address points have correct parcel number, so no need to do a geographic search when attribute query will work
        var unique_Occupants = new Deferred(); //deferred variable
        var uniqueParcels = this._MailingLabels_UniqueField(currentResults, 'TaxParcelNumber'); //get unique parcel numbers
        this.qMailingLabelsOccupants.where = "PARCELNUMBER in (" + uniqueParcels.join() + ")"; //Query address points by parcel number - Update where clause - change array to string for where parameter
        //Run another deferred query - Site addresses (occupants) by currently selected parcels
        this.qtMailingLabelsOccupants.execute(this.qMailingLabelsOccupants, lang.hitch(this, function(results) {
          //Format results array & remove duplicates
          var unique_array_Occupants = this._MailingLabels_format4CSV(results.features, results.fieldAliases);
          unique_array_Occupants.forEach(function(n) {
            n.Name = 'Occupant'
          }); //Add name field = Occupant -  Name: Occupant to array
          unique_Occupants.resolve(unique_array_Occupants); //update deferred variable
        }), function(error) { //lang.hitch
          console.log(error); //error message for this.qtMailingLabelsOccupants.execute
        }); //end deferred query for parcels by Groupaccount

        return unique_Occupants; //updated deferred variable
      },

      _MailingLabels_UniqueGroupaccounts: function(currentResults) {
        var unique_Groupaccounts = new Deferred(); //deferred variable
        var uniqueGROUPACCOUNT = this._MailingLabels_UniqueField(currentResults, 'GROUPACCOUNTNUMBER'); //get group account numbers by web service field name 'GROUPACCOUNTNUMBER'
        if (uniqueGROUPACCOUNT.length > 0) {
          //Update where clause & query for all related parcels by Groupaccount
          this.qMailingLabelsGroupAccount.where = "Appraisal_account.GROUPACCOUNTNUMBER in (" + uniqueGROUPACCOUNT.join() + ")"; //change array to string for where parameter
          //Run another deferred query - query for parcels by Groupaccount
          this.qtMailingLabelsGroupAccount.execute(this.qMailingLabelsGroupAccount, lang.hitch(this, function(results) {
            var unique_array_Groupaccount = this._MailingLabels_format4CSV(results.features, results.fieldAliases); //Groupaccount parcels - format array & remove duplicates 
            unique_Groupaccounts.resolve(unique_array_Groupaccount); //update deferred variable
          }), function(error) { //lang.hitch
            console.log(error); //error message for this.qtMailingLabelsGroupAccount.execute
          }); //end deferred query for parcels by Groupaccount
        } else { //selected parcels have no GROUPACCOUNT numbers
          unique_Groupaccounts.resolve([]); //update deferred variable with empty array
        } //end GROUPACCOUNT length check

        return unique_Groupaccounts; //updated deferred variable
      },

      _MailingLabels_UniqueField: function(results, FIELD) {
        var listFIELD = []; //Array to hold all FIELD values from results, includes duplicates
        array.forEach(results, function(selected) {
          var currentRecord = selected.attributes;
          for (var index in currentRecord) {
            //console.error( index + " : " + currentRecord[index]);
            if (index == FIELD) {
              listFIELD.push("'" + currentRecord[index] + "'"); // Add requested FIELD value for every record to array
            }

          }
        });

        //Filter down to unique values (remove duplicates from simple array) - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
        var uniqueFIELD = listFIELD.filter(function(elem, index, self) {
          return index == self.indexOf(elem);
        });

        return uniqueFIELD;
      },

      _MailingLabels_formatAliases: function(fieldNameArray) {
        var currentAliases = {};
        array.forEach(fieldNameArray, function(record) { //loop through multiple fields & Create array name:alias
          currentAliases[record.name] = record.alias; //key-value pairs, limit which fields to use (name)
        });
        return currentAliases
      },

      _MailingLabels_format4CSV: function(results, aliases) {
        //Create CSV-style array of with array of results records and array of alias names
        var currentResults = [];
        array.forEach(results, function(record) { //loop through all records & Create array of feature.attributes
          var currentRecord = record.attributes;

          Object.keys(aliases).forEach(function(key) {
            currentRecord[aliases[key]] = currentRecord[key] // add (duplicate) to array the values with an alias name - assign new key with value of prior key
            //DON'T delete currentRecord[key] BECAUSE IT WILL ALSO REMOVE THE KEY FROM MAP LAYER VALUES & EXPORT PANEL RESULTS ARRAY
            //COULD LOOP THROUGH currentResults BELOW AND REMOVE EXTRA KEYS, HOWEVER _MailingLabels_exportCSV WILL IGNORE EXTRA FIELDS
            //delete currentRecord[key]  //  remove prior key (WARNING: if actual name & alias the same, field is deleted!!!)
          });

          currentResults.push(currentRecord); //add formatted results to array
        });

        console.error('Total records: ', currentResults.length);

        var unique_array = this._MailingLabels_format4CSV_noDups(currentResults); //remove duplicates
        return unique_array;
      },

      _MailingLabels_format4CSV_noDups: function(currentResults) {
        //Remove duplicates based on Address field only - last duplicate record is kept!!! 
        //http://www.tjcafferkey.me/remove-duplicates-from-array-of-objects/
        var unique_array = []; //Array for unique values - remove duplicates from results
        var lookup = {};

        for (var i in currentResults) {
          lookup[currentResults[i]["Address"]] = currentResults[i];
        }

        for (i in lookup) {
          unique_array.push(lookup[i]);
        }
        console.error('Count with duplicates removed: ', unique_array.length);

        return unique_array;
      },

      _MailingLabels_exportCSV: function(array) {
        //CSV Export Workaround - need 'jimu/CSVUtils' & CSVUtils (functions mixed in somehow to ... menu (_onBtnMenuClicked in SingleQueryResult.js), but don't know how to call)
        //function(filename, datas, columns) - see CSVUtils.js
        CSVUtils.exportCSV('Mailing Labels', array, ['Name', 'Care Of', 'Address', 'City', 'State', 'Zip']); //Missing fields will be dropped - same list for every CSV - make global variable of field names
      },

      _MailingLabels_createButton: function(array) {
        //Create 'Mailing Labels' button that opens results as a CSV file   (see 'Export to CSV file' function - ..\jimu.js\CSVUtils.js)
        //console.error(document.getElementById("Btn_MailingLabels") != null);  //same task = false
        //Remove existing button
        var element = document.getElementById("Btn_MailingLabels");
        if (element != null) {
          element.parentNode.removeChild(element)
        };
        //console.error(dojo.byId("Btn_MailingLabels"));

        //Build button
        var node1 = document.createElement("div");
        var textnode1 = document.createTextNode("Mailing Labels (click for CSV file)");
        node1.className = "jimu-btn";
        node1.id = "Btn_MailingLabels";
        //node1.style.backgroundColor = "#15a4fa";
        //node1.style.background = "#518dca";
        //node1.style.backgroundColor = "#518dca";
        node1.style.display = "block";
        node1.style.clear = "both";
        node1.appendChild(textnode1);

        //Build blank line
        var node2 = document.createElement("div");
        var br = document.createElement("br");
        node1.style.display = "block";
        node2.style.clear = "both";
        node2.appendChild(br);

        //Array of available tasks & Array of user order of selected tasks
        //Find element for button insertion by current object property domNode (from singleQueryResult)
        //this._resultLayerInfos[#] - # is the order of which task has been run - need to use the current task index, which varies by the order tasks are run
        //Find DOM object index number that contains the current taskIndex - deferred need lang.hitch
        this._MailingLabels_findIndex(this._resultLayerInfos).then(lang.hitch(this, function(value) {
          // Deferred success
          //console.error('DOM Index: ', value);  //index
          var theElement = this._resultLayerInfos[value].singleQueryResult.domNode.childNodes[1].childNodes[5]; //results-container
          //To find element from initial Widget.html (this.<div>) see https://geonet.esri.com/message/564463?commentID=564463#comment-564463
          //Add to panel
          theElement.insertBefore(node2, theElement.childNodes[0]); //puts button into results-container, but scrolls with parcels 
          theElement.insertBefore(node1, theElement.childNodes[0]); //puts blank line under button 
          //Add click event to button - this.own(on(Node, 'click', lang.hitch(this, FUNCTION, param1, param2, etc)));
          this.own(on(dojo.byId("Btn_MailingLabels"), 'click', lang.hitch(this, this._MailingLabels_exportCSV, array))); //this.own(on(Node, 'click', lang.hitch(this, FUNCTION, param1, param2, etc)));

        }), function(error) { //lang.hitch
          // Do something when the process errors out
          alert(err);
        }); //end deferred
      },

      _MailingLabels_findIndex: function(array1) {
        var indexDom = new Deferred();
        var currentTaskIndex = this.currentTaskIndex; //current task # being run (instead of using lang hitch)
        //loop through each object looking for the currentTaskIndex = taskIndex & return object index number
        //each object contains the results and task query #, need to find order user performed tasks to put button in correct location
        array.forEach(array1, function(record, index) { //loop through all records
          //console.error('Task Name: ', record.label, ' - Task Index: ', record.taskIndex, ' - DOM Index: ', index);
          if (currentTaskIndex == record.taskIndex) {
            //found the DOM index (order that the task (which has it's own index - this.currentTaskIndex) is being done by user) to place the Mailing Labels button
            indexDom.resolve(index);
          }
        });
        return indexDom;

      }

      //end MJM mailing label functions

    });
  });
