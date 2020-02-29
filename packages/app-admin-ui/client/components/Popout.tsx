import React, { Fragment, ComponentType, Ref } from 'react';
import styled from '@emotion/styled';

import { Button } from '@k5ui/button';
import PopoutModal from '@k5ui/popout';
import { colors, gridSize } from '@k5ui/theme';
import { alpha } from '@k5ui/color-utils';

export const POPOUT_GUTTER = gridSize * 2;

// Layout
const Bar = styled.div({
  paddingBottom: gridSize * 1.5,
  paddingTop: gridSize * 1.5,
  marginLeft: POPOUT_GUTTER,
  marginRight: POPOUT_GUTTER,
  position: 'relative',
  zIndex: 1,
});
const Header = styled(Bar)({
  alignItems: 'center',
  boxShadow: `0 2px 0 ${alpha(colors.text, 0.1)}`,
  display: 'flex',
  justifyContent: 'center',
  textAlign: 'center',
});
const HeaderTitle = styled.div({
  fontWeight: 'bold',
  fontSize: '0.85em',
});
const HeaderLeft = styled.div({
  position: 'absolute',
  left: 0,
});
const HeaderRight = styled.div({
  position: 'absolute',
  left: 0,
});
const Body = styled.div({
  maxHeight: 300,
  overflowY: 'auto',
  overflowX: 'hidden',
  WebkitOverflowScroll: 'touch',
});
const Footer = styled(Bar)({
  alignItems: 'center',
  boxShadow: `0 -2px 0 ${alpha(colors.text, 0.1)}`,
  display: 'flex',
  justifyContent: 'space-between',
});

// Other
export const DisclosureArrow = styled.span<{ size? }>(({ size = '0.3em' }) => ({
  borderLeft: `${size} solid transparent`,
  borderRight: `${size} solid transparent`,
  borderTop: `${size} solid`,
  display: 'inline-block',
  height: 0,
  marginLeft: '0.33em',
  marginTop: '-0.125em',
  verticalAlign: 'middle',
  width: 0,
}));

type Props = {
  buttonLabel?: string;
  children?: $TSFixMe;
  component?: ComponentType<any>;
  innerRef?: Ref<any>;
  bodyRef?: Ref<any>;
  footerContent?: $TSFixMe;
  headerAfter?: Node;
  headerBefore?: Node;
  headerTitle?: string;
  target?: $TSFixMe;
};

export const Popout = ({
  buttonLabel,
  component: Wrapper,
  children,
  innerRef,
  bodyRef,
  footerContent,
  headerAfter,
  headerBefore,
  headerTitle,
  target,
  ...props
}: Props) => {
  const defaultTarget = handlers => (
    <Button variant="subtle" appearance="primary" {...handlers}>
      {buttonLabel}
      <DisclosureArrow />
    </Button>
  );

  return (
    <PopoutModal ref={innerRef} target={target || defaultTarget} {...props}>
      <Wrapper>
        <Header>
          <HeaderLeft>{headerBefore}</HeaderLeft>
          <HeaderTitle>{headerTitle}</HeaderTitle>
          <HeaderRight>{headerAfter}</HeaderRight>
        </Header>
        <Body ref={bodyRef}>{children}</Body>
        {footerContent ? <Footer>{footerContent}</Footer> : null}
      </Wrapper>
    </PopoutModal>
  );
};

Popout.defaultProps = {
  component: Fragment,
};
