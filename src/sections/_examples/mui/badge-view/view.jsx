import Box from '@mui/material/Box';
import Badge from '@mui/material/Badge';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { Iconify } from 'src/components/iconify';

import { ComponentBox, ComponentLayout } from '../../layout';

// ----------------------------------------------------------------------

const STATUS = ['always', 'online', 'busy', 'offline', 'invisible'];
const COLORS = ['default', 'primary', 'secondary', 'info', 'success', 'warning', 'error'];

const componentBoxStyles = {
  gap: 4,
};

const placeholderStyles = {
  width: 40,
  height: 40,
  bgcolor: 'warning.main',
};

// ----------------------------------------------------------------------

const renderIcon = () => <Iconify icon="solar:letter-bold" width={24} />;

const DEMO_COMPONENTS = [
  {
    name: 'Basic',
    component: (
      <ComponentBox sx={componentBoxStyles}>
        {COLORS.map((color) => (
          <Badge key={color} badgeContent={4} color={color}>
            {renderIcon()}
          </Badge>
        ))}
      </ComponentBox>
    ),
  },
  {
    name: 'Maximum value',
    component: (
      <ComponentBox sx={componentBoxStyles}>
        <Badge color="error" badgeContent={99} children={renderIcon()} />
        <Badge color="error" badgeContent={100} children={renderIcon()} />
        <Badge max={999} color="error" badgeContent={1000} children={renderIcon()} />
      </ComponentBox>
    ),
  },
  {
    name: 'Dot badge',
    component: (
      <ComponentBox sx={componentBoxStyles}>
        <Badge color="info" variant="dot">
          {renderIcon()}
        </Badge>
        <Badge color="info" variant="dot">
          <Typography>Typography</Typography>
        </Badge>
      </ComponentBox>
    ),
  },
  {
    name: 'Badge overlap',
    component: (
      <ComponentBox sx={componentBoxStyles}>
        <Badge color="info" badgeContent=" ">
          <Box sx={{ ...placeholderStyles }} />
        </Badge>
        <Badge color="info" variant="dot" badgeContent=" ">
          <Box sx={{ ...placeholderStyles }} />
        </Badge>
        <Badge color="info" overlap="circular" badgeContent=" ">
          <Box sx={{ ...placeholderStyles, borderRadius: '50%' }} />
        </Badge>
        <Badge color="info" variant="dot" overlap="circular" badgeContent=" ">
          <Box sx={{ ...placeholderStyles, borderRadius: '50%' }} />
        </Badge>
      </ComponentBox>
    ),
  },
  {
    name: 'Status',
    component: (
      <ComponentBox sx={componentBoxStyles}>
        {STATUS.map((status) => (
          <Tooltip key={status} title={status}>
            <Badge variant={status} badgeContent=" ">
              <Box
                sx={{
                  ...placeholderStyles,
                  borderRadius: '50%',
                  bgcolor: 'grey.400',
                }}
              />
            </Badge>
          </Tooltip>
        ))}
      </ComponentBox>
    ),
  },
];

// ----------------------------------------------------------------------

export function BadgeView() {
  return (
    <ComponentLayout
      sectionData={DEMO_COMPONENTS}
      heroProps={{
        heading: 'Badge',
        moreLinks: ['https://mui.com/material-ui/react-badge/'],
      }}
    />
  );
}
