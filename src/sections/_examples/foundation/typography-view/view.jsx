import { useMemo } from 'react';
import { pickBy, upperFirst } from 'es-toolkit';

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

import { ComponentBox, ComponentLayout } from '../../layout';

// ----------------------------------------------------------------------

const TEXT_COLORS = ['primary', 'secondary', 'disabled'];
const BASE_COLORS = ['primary', 'secondary', 'info', 'warning', 'error'];
const VARIANTS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'subtitle1',
  'subtitle2',
  'body1',
  'body2',
  'caption',
  'overline',
  'button',
];

const componentBoxStyles = {
  py: 3,
  flexDirection: 'column',
  alignItems: 'flex-start',
};

const LOREM_TEXT = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut
labore et dolore magna aliqua.
`;

// ----------------------------------------------------------------------

const DEMO_COMPONENTS = [
  ...VARIANTS.map((variant) => ({
    name: upperFirst(variant),
    component: <VariantPreview variant={variant} />,
  })),
  {
    name: 'Colors',
    component: (
      <Box
        sx={{
          gap: 3,
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(1, 1fr)',
            sm: 'repeat(2, 1fr)',
          },
        }}
      >
        <Box sx={{ gap: 3, display: 'flex', flexDirection: 'column' }}>
          {TEXT_COLORS.map((color) => (
            <ComponentBox
              key={color}
              sx={(theme) => ({
                ...componentBoxStyles,
                gap: 2,
                color: theme.vars.palette.text[color],
              })}
            >
              <Typography variant="subtitle1">Text {color}</Typography>
              <Typography variant="body2">{LOREM_TEXT}</Typography>
            </ComponentBox>
          ))}
        </Box>

        <Box sx={{ gap: 3, display: 'flex', flexDirection: 'column' }}>
          {BASE_COLORS.map((color) => (
            <ComponentBox
              key={color}
              sx={(theme) => ({
                ...componentBoxStyles,
                gap: 2,
                color: theme.vars.palette[color].main,
              })}
            >
              <Typography variant="subtitle1" sx={{ textTransform: 'capitalize' }}>
                {color}
              </Typography>
              <Typography variant="body2">{LOREM_TEXT}</Typography>
            </ComponentBox>
          ))}
        </Box>
      </Box>
    ),
  },
];

export function TypographyView() {
  return (
    <ComponentLayout
      sectionData={DEMO_COMPONENTS}
      heroProps={{
        heading: 'Typography',
        moreLinks: ['https://mui.com/components/typography'],
      }}
    />
  );
}

// ----------------------------------------------------------------------

function formatStyleValues(value) {
  if (typeof value === 'string' && value.endsWith('rem')) {
    const number = parseFloat(value);
    return `${value} (${Math.round(number * 16)}px)`;
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, formatStyleValues(v)]));
  }

  return value;
}

function VariantPreview({ variant }) {
  const theme = useTheme();

  const filteredStyles = pickBy(
    theme.typography[variant],
    (_, key) =>
      ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].includes(key) ||
      key.startsWith('@media')
  );

  const formattedStyles = useMemo(() => formatStyleValues(filteredStyles), [filteredStyles]);

  return (
    <ComponentBox
      sx={{
        flexWrap: 'unset',
        alignItems: 'flex-start',
        flexDirection: { xs: 'column', lg: 'row' },
      }}
    >
      <Typography variant={variant} sx={{ flexGrow: 1 }}>
        How can you choose a typeface?
      </Typography>

      <Box
        component="pre"
        sx={[
          {
            p: 2,
            m: 0,
            flexShrink: 0,
            borderRadius: 1.5,
            typography: 'body2',
            whiteSpace: 'pre-wrap',
            color: 'text.secondary',
            bgcolor: 'background.neutral',
            border: `dashed 1px ${theme.palette.divider}`,
            fontFamily: '"Lucida Console", Courier, monospace',
            width: { xs: 1, lg: 320 },
          },
        ]}
      >
        {JSON.stringify(formattedStyles, null, 2)}
      </Box>
    </ComponentBox>
  );
}
