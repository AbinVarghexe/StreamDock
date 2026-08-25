/**
 * CSInterface - Adobe CEP JavaScript Bridge
 * Provides communication between HTML/JS panel and Premiere Pro ExtendScript.
 */
(function (global) {
  'use strict';

  function CSInterface() {}

  /**
   * Evaluates a JavaScript script in the ExtendScript host environment.
   * @param {string} script The ExtendScript code to evaluate.
   * @param {function} callback Optional callback receiving the string result.
   */
  CSInterface.prototype.evalScript = function (script, callback) {
    if (global.__adobe_cep__ && typeof global.__adobe_cep__.evalScript === 'function') {
      global.__adobe_cep__.evalScript(script, callback || function () {});
    } else {
      if (callback) {
        callback(JSON.stringify({ success: false, message: "CEP host not available (browser mode)" }));
      }
    }
  };

  /**
   * Retrieves the system path to extension resources.
   */
  CSInterface.prototype.getSystemPath = function (pathType) {
    if (global.__adobe_cep__ && typeof global.__adobe_cep__.getSystemPath === 'function') {
      return global.__adobe_cep__.getSystemPath(pathType);
    }
    return "";
  };

  /**
   * Closes this extension panel.
   */
  CSInterface.prototype.closeExtension = function () {
    if (global.__adobe_cep__ && typeof global.__adobe_cep__.closeExtension === 'function') {
      global.__adobe_cep__.closeExtension();
    }
  };

  /**
   * Dispatches a CEP event.
   */
  CSInterface.prototype.dispatchEvent = function (event) {
    if (global.__adobe_cep__ && typeof global.__adobe_cep__.dispatchEvent === 'function') {
      global.__adobe_cep__.dispatchEvent(event);
    }
  };

  /**
   * Registers an event listener for CEP events.
   */
  CSInterface.prototype.addEventListener = function (type, listener, obj) {
    if (global.__adobe_cep__ && typeof global.__adobe_cep__.addEventListener === 'function') {
      global.__adobe_cep__.addEventListener(type, listener, obj);
    }
  };

  /**
   * Removes an event listener.
   */
  CSInterface.prototype.removeEventListener = function (type, listener, obj) {
    if (global.__adobe_cep__ && typeof global.__adobe_cep__.removeEventListener === 'function') {
      global.__adobe_cep__.removeEventListener(type, listener, obj);
    }
  };

  /**
   * Opens a URL in the default web browser.
   */
  CSInterface.prototype.openURLInDefaultBrowser = function (url) {
    if (global.__adobe_cep__ && typeof global.__adobe_cep__.openURLInDefaultBrowser === 'function') {
      global.__adobe_cep__.openURLInDefaultBrowser(url);
    } else {
      window.open(url, '_blank');
    }
  };

  /**
   * Retrieves host environment parameters (appId, appVersion, etc.).
   */
  CSInterface.prototype.getHostEnvironment = function () {
    if (global.__adobe_cep__ && typeof global.__adobe_cep__.getHostEnvironment === 'function') {
      var str = global.__adobe_cep__.getHostEnvironment();
      try {
        return JSON.parse(str);
      } catch (e) {
        return {};
      }
    }
    return { appName: "PPRO", appVersion: "24.0" };
  };

  global.CSInterface = CSInterface;
})(window);
