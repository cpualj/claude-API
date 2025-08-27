import { useMemo, Fragment } from 'react';
import { isExternalLink } from 'minimal-shared/utils';

import Link from '@mui/material/Link';
import { GridActionsCellItem } from '@mui/x-data-grid';
import { menuItemClasses } from '@mui/material/MenuItem';

import { RouterLink } from 'src/routes/components';

// ----------------------------------------------------------------------

const getLinkProps = (href) => {
  if (!href) return {};

  return isExternalLink(href)
    ? { component: Link, href, target: '_blank', rel: 'noopener noreferrer' }
    : { component: RouterLink, href };
};

export function CustomGridActionsCellItem({ href, showInMenu, ...other }) {
  const linkProps = useMemo(() => getLinkProps(href), [href]);
  const Wrapper = href ? 'li' : Fragment;

  if (showInMenu) {
    return (
      <Wrapper {...(href && { className: menuItemClasses.root })}>
        <GridActionsCellItem {...other} {...linkProps} showInMenu />
      </Wrapper>
    );
  }

  return <GridActionsCellItem {...other} {...linkProps} showInMenu={false} />;
}
