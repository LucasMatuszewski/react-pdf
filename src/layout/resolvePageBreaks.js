import * as R from 'ramda';

import shouldNodeBreak from '../node/shouldBreak';
import getContentArea from '../page/getContentArea';
import { resolvePageDimensions } from './resolveDimensions';

const getHeight = R.path(['box', 'height']);

const getTop = R.pathOr(0, ['box', 'top']);

const getChildren = R.propOr([], 'children');

const setChildren = R.assoc('children');

const setHeight = R.assocPath(['box', 'height']);

const setBreak = R.assocPath(['props', 'break']);

const breakChildren = (height, node) => {
  const children = getChildren(node);

  let offset = null;
  let nextElements = [];
  const currentElements = [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const childTop = getTop(child);
    const childHeight = getHeight(child);
    const futureElements = children.slice(i + 1);
    const shouldBreak = shouldNodeBreak(child, futureElements, height);

    if (shouldBreak) {
      offset = childTop;
      nextElements = R.compose(
        R.prepend(setBreak(false, child)),
        R.slice(i + 1, Infinity),
      )(children);
      break;
    }

    const [currentChildren, nextChildren, childsOffset] = breakChildren(
      height,
      child,
    );

    if (R.isNil(childsOffset)) {
      currentElements.push(setChildren(currentChildren, child));
      continue;
    }

    offset = childTop + childsOffset;

    currentElements.push(
      R.compose(
        setChildren(currentChildren),
        setHeight(Math.ceil(offset / height) * height - childTop),
      )(child),
    );

    nextElements = R.compose(
      R.prepend(
        R.compose(
          setChildren(nextChildren),
          setHeight(child.box.height - childHeight),
        )(child),
      ),
      R.slice(i + 1, Infinity),
    )(children);

    break;
  }

  return [currentElements, nextElements, offset];
};

const breakNode = height => node => {
  const [currentChildren, nextChildren, offset] = breakChildren(height, node);

  if (R.isNil(offset)) return [node];

  const currentNode = R.compose(
    setChildren(currentChildren),
    setHeight(Math.ceil(offset / height) * height),
  )(node);

  const nextNode = R.compose(
    setChildren(nextChildren),
    setHeight(node.box.height - offset),
  )(node);

  return [currentNode, nextNode];
};

const breakPage = page => {
  const pages = [];
  const height = getContentArea(page);

  let subpages = breakNode(height)(page);
  let current = subpages[0];
  let nextPage = subpages[1];

  pages.push(current);

  while (nextPage) {
    subpages = R.compose(
      breakNode(height),
      resolvePageDimensions,
      setHeight(null),
    )(nextPage);

    current = subpages[0];
    nextPage = subpages[1];

    pages.push(current);
  }

  return pages;
};

const removePagePadding = page => {
  const paddingTop = R.pathOr(0, ['box', 'paddingTop'], page);
  const paddingBottom = R.pathOr(0, ['box', 'paddingBottom'], page);

  return R.compose(
    R.assoc('_oldPadding', { paddingTop, paddingBottom }),
    R.evolve({
      box: {
        paddingTop: R.always(0),
        paddingBottom: R.always(0),
        height: R.subtract(R.__, paddingTop + paddingBottom),
      },
      children: R.map(
        R.evolve({
          box: { top: R.subtract(R.__, paddingTop) },
        }),
      ),
    }),
  )(page);
};

const removePadding = R.evolve({
  children: R.map(
    R.evolve({
      children: R.map(removePagePadding),
    }),
  ),
});

const restorePadding = R.evolve({
  children: R.map(
    R.evolve({
      children: R.map(restorePagePadding),
    }),
  ),
});

const restorePagePadding = page => {
  const paddingTop = R.pathOr(0, ['_oldPadding', 'paddingTop'], page);
  const paddingBottom = R.pathOr(0, ['_oldPadding', 'paddingBottom'], page);

  return R.compose(
    R.dissoc('_oldPadding'),
    R.evolve({
      box: {
        paddingTop: R.always(paddingTop),
        paddingBottom: R.always(paddingBottom),
        height: R.add(paddingTop + paddingBottom),
      },
      children: R.map(
        R.evolve({
          box: { top: R.add(paddingTop) },
        }),
      ),
    }),
  )(page);
};

const resolvePageBreaks = R.evolve({
  children: R.map(
    R.evolve({
      children: R.compose(
        R.flatten,
        R.map(
          R.compose(
            restorePadding,
            breakPage,
            removePadding,
          ),
        ),
      ),
    }),
  ),
});

export default resolvePageBreaks;