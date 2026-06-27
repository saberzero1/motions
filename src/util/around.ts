/**
 * Monkey-patch object methods with safe removal.
 *
 * Based on https://github.com/pjeby/monkey-around (MIT).
 * Internalized to avoid an external dependency for ~40 lines.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- monkey-patching arbitrary object methods requires dynamic typing */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- same: prototype manipulation is inherently untyped */

type Uninstaller = () => void;

export function around(
    obj: any,
    factories: Record<string, (next: any) => any>,
): Uninstaller {
    const removers = Object.keys(factories).map((key) =>
        around1(obj, key, factories[key]!),
    );
    return removers.length === 1
        ? removers[0]!
        : () => removers.forEach((r) => r());
}

function around1(
    obj: any,
    method: string,
    createWrapper: (next: any) => any,
): Uninstaller {
    const inherited = obj[method];
    const hadOwn = Object.prototype.hasOwnProperty.call(obj, method);
    const original = hadOwn
        ? inherited
        : function (this: any, ...args: any[]) {
              return Object.getPrototypeOf(obj)[method].apply(this, args);
          };

    let current = createWrapper(original);
    if (inherited) Object.setPrototypeOf(current, inherited);
    Object.setPrototypeOf(wrapper, current);
    obj[method] = wrapper;

    return remove;

    function wrapper(this: any, ...args: any[]) {
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
        Object.setPrototypeOf(wrapper, inherited || Function);
    }
}

/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
