import path from 'path';

const pkgDir = path.dirname(require.resolve('@k5js/fields/package.json'));

export const resolveView = pathname => path.join(pkgDir, pathname);
