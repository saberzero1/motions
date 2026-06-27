/**
 * Monkey-patch object methods with safe removal.
 *
 * Based on https://github.com/pjeby/monkey-around (MIT).
 * Internalized to avoid an external dependency for ~40 lines.
 */

type Uninstaller = () => void;
type Fn = (...args: unknown[]) => unknown;

export function around(
    obj: Record<string, Fn>,
    factories: Record<string, (next: Fn) => Fn>,
): Uninstaller {
    const removers = Object.keys(factories).map((key) =>
        around1(obj, key, factories[key]!),
    );
    return removers.length === 1
        ? removers[0]!
        : () => removers.forEach((r) => r());
}

function around1(
    obj: Record<string, Fn>,
    method: string,
    createWrapper: (next: Fn) => Fn,
): Uninstaller {
    const inherited = obj[method];
    const hadOwn = Object.prototype.hasOwnProperty.call(obj, method);
    const original: Fn = hadOwn
        ? (inherited as Fn)
        : function (this: unknown, ...args: unknown[]) {
              const proto = Object.getPrototypeOf(obj) as Record<string, Fn>;
              return proto[method]!.apply(this, args);
          };

    let current: Fn = createWrapper(original);
    if (inherited) Object.setPrototypeOf(current, inherited);
    Object.setPrototypeOf(wrapper, current);
    obj[method] = wrapper;

    return remove;

    function wrapper(this: unknown, ...args: unknown[]) {
        if (current === original && obj[method] === wrapper) remove();
        return current.apply(this, args);
    }

    function remove() {
        if (obj[method] === wrapper) {
            if (hadOwn) obj[method] = original;
            else delete obj[method];
        }
        if (current === original) return;
        current = original;
        Object.setPrototypeOf(wrapper, inherited ?? Function);
    }
}
