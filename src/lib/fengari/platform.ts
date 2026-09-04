type PlatformModuleLoader = (name: string) => object;

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

let _moduleCache: Record<string, object | null> = {};

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

const requireModule = function (name: string): object | null {
    if (!_provider.isDesktop || !_provider.requireModule) return null;
    const cached = _moduleCache[name];
    if (cached !== undefined) return cached;
    try {
        _moduleCache[name] = _provider.requireModule(name);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- catch binding intentionally unused
    } catch (_e) {
        _moduleCache[name] = null;
    }
    return _moduleCache[name];
};

export { setPlatformProvider, isDesktop, requireModule };
