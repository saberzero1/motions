'use strict';

let _provider = {
    isDesktop: false,
    requireModule: null,
};

let _moduleCache = {};

const setPlatformProvider = function (provider) {
    _provider = {
        isDesktop: !!provider.isDesktop,
        requireModule: provider.requireModule || null,
    };
    _moduleCache = {};
};

const isDesktop = function () {
    return _provider.isDesktop;
};

const requireModule = function (name) {
    if (!_provider.isDesktop || !_provider.requireModule) return null;
    if (_moduleCache[name] !== undefined) return _moduleCache[name];
    try {
        _moduleCache[name] = _provider.requireModule(name);
    } catch (e) {
        _moduleCache[name] = null;
    }
    return _moduleCache[name];
};

module.exports.setPlatformProvider = setPlatformProvider;
module.exports.isDesktop = isDesktop;
module.exports.requireModule = requireModule;
