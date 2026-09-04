type PlatformModuleLoader = (name: string) => unknown;
type ModuleOrNull = ReturnType<PlatformModuleLoader> | null;

interface PlatformProvider {
    isDesktop?: boolean;
    requireModule?: PlatformModuleLoader | null;
}

let _provider: {
    isDesktop: boolean;
    requireModule: PlatformModuleLoader | null;
} = {
    isDesktop: false,
    requireModule: null,
};

let _moduleCache: Record<string, ModuleOrNull> = {};

const setPlatformProvider = function (provider: PlatformProvider): void {
    _provider = {
        isDesktop: !!provider.isDesktop,
        requireModule: provider.requireModule || null,
    };
    _moduleCache = {};
};

const isDesktop = function (): boolean {
    return _provider.isDesktop;
};

const requireModule = function (name: string): ModuleOrNull {
    if (!_provider.isDesktop || !_provider.requireModule) return null;
    const cached = _moduleCache[name];
    if (cached !== undefined) return cached;
    try {
        _moduleCache[name] = _provider.requireModule(name);
    } catch (_e) {
        _moduleCache[name] = null;
    }
    return _moduleCache[name];
};

export { setPlatformProvider, isDesktop, requireModule };
