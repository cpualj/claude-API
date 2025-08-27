import Box from '@mui/material/Box';
import Switch from '@mui/material/Switch';
import FormGroup from '@mui/material/FormGroup';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';

import { ComponentBox, ComponentLayout } from '../../layout';

// ----------------------------------------------------------------------

const PLACEMENTS = ['top', 'start', 'bottom', 'end'];
const COLORS = ['default', 'primary', 'secondary', 'info', 'success', 'warning', 'error'];

// ----------------------------------------------------------------------

const renderColor = (title, disabled) => (
  <ComponentBox title={title}>
    <FormControl component="fieldset">
      <FormGroup>
        {COLORS.map((color) => (
          <FormControlLabel
            disabled={disabled}
            key={color}
            label={color}
            control={
              <Switch
                defaultChecked
                color={color}
                slotProps={{ input: { id: `${color}-${title}-switch` } }}
              />
            }
            sx={{ textTransform: 'capitalize' }}
          />
        ))}
      </FormGroup>

      <FormControlLabel
        disabled={disabled}
        label="No check"
        control={
          <Switch color="error" slotProps={{ input: { id: `${title}-disabled-off-switch` } }} />
        }
      />
    </FormControl>
  </ComponentBox>
);

export function SwitchView() {
  const DEMO_COMPONENTS = [
    {
      name: 'Basic',
      component: (
        <ComponentBox>
          <Switch defaultChecked slotProps={{ input: { id: 'checked-switch' } }} />
          <Switch slotProps={{ input: { id: 'unchecked-switch' } }} />
          <Switch disabled slotProps={{ input: { id: 'disabled-unchecked-switch' } }} />
          <Switch disabled checked slotProps={{ input: { id: 'disabled-checked-switch' } }} />
          <Switch
            defaultChecked
            color="default"
            slotProps={{ input: { id: 'color-checked-switch' } }}
          />
        </ComponentBox>
      ),
    },
    {
      name: 'Sizes',
      component: (
        <ComponentBox>
          <FormGroup row>
            <FormControlLabel
              label="Small"
              control={<Switch size="small" slotProps={{ input: { id: 'small-switch' } }} />}
            />
            <FormControlLabel
              label="Medium"
              control={<Switch slotProps={{ input: { id: 'medium-switch' } }} />}
            />
          </FormGroup>
        </ComponentBox>
      ),
    },
    {
      name: 'Placement',
      component: (
        <ComponentBox>
          <FormGroup row>
            {PLACEMENTS.map((placement) => (
              <FormControlLabel
                key={placement}
                value={placement}
                label={placement}
                labelPlacement={placement}
                control={<Switch slotProps={{ input: { id: `${placement}-switch` } }} />}
                sx={{ textTransform: 'capitalize' }}
              />
            ))}
          </FormGroup>
        </ComponentBox>
      ),
    },
    {
      name: 'Colors',
      component: (
        <Box
          sx={{
            rowGap: 5,
            columnGap: 3,
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(1, 1fr)', md: 'repeat(2, 1fr)' },
          }}
        >
          {renderColor('Default')}
          {renderColor('Disabled', true)}
        </Box>
      ),
    },
  ];

  return (
    <ComponentLayout
      sectionData={DEMO_COMPONENTS}
      heroProps={{
        heading: 'Switch',
        moreLinks: ['https://mui.com/material-ui/react-switch/'],
      }}
    />
  );
}
