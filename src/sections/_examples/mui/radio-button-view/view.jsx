import { useState, useCallback } from 'react';

import Radio from '@mui/material/Radio';
import FormLabel from '@mui/material/FormLabel';
import RadioGroup from '@mui/material/RadioGroup';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';

import { ComponentBox, ComponentLayout } from '../../layout';

// ----------------------------------------------------------------------

const PLACEMENTS = ['top', 'start', 'bottom', 'end'];
const COLORS = ['default', 'primary', 'secondary', 'info', 'success', 'warning', 'error'];

// ----------------------------------------------------------------------

export function RadioButtonView() {
  const [value, setValue] = useState('a1');

  const handleChange = useCallback((event) => {
    setValue(event.target.value);
  }, []);

  const DEMO_COMPONENTS = [
    {
      name: 'Basic',
      component: (
        <ComponentBox>
          <FormControl component="fieldset">
            <RadioGroup row defaultValue="nn">
              <Radio size="medium" value="nn" />
              <Radio size="medium" value="gg" />
              <Radio size="medium" disabled value="hh" />
            </RadioGroup>
          </FormControl>
        </ComponentBox>
      ),
    },
    {
      name: 'Sizes',
      component: (
        <ComponentBox>
          <RadioGroup row defaultValue="g">
            <FormControlLabel value="g" label="Normal" control={<Radio size="medium" />} />
            <FormControlLabel value="p" label="Small" control={<Radio size="small" />} />
          </RadioGroup>
        </ComponentBox>
      ),
    },
    {
      name: 'Placement',
      component: (
        <ComponentBox>
          <FormControl component="fieldset">
            <RadioGroup row defaultValue="top">
              {PLACEMENTS.map((placement) => (
                <FormControlLabel
                  key={placement}
                  value={placement}
                  label={placement}
                  labelPlacement={placement}
                  control={<Radio size="medium" />}
                  sx={{ textTransform: 'capitalize' }}
                />
              ))}
            </RadioGroup>
          </FormControl>
        </ComponentBox>
      ),
    },
    {
      name: 'Colors',
      component: (
        <ComponentBox>
          <FormControl component="fieldset">
            <FormLabel component="legend" id="radio-colors" sx={{ mb: 1, typography: 'body2' }}>
              Colors
            </FormLabel>
            <RadioGroup aria-labelledby="radio-colors" value={value} onChange={handleChange}>
              {COLORS.map((color) => (
                <FormControlLabel
                  key={color}
                  value={color}
                  label={color}
                  control={<Radio size="medium" color={color} />}
                  sx={{ textTransform: 'capitalize' }}
                />
              ))}

              <FormControlLabel
                disabled
                value="a8"
                label="Disabled"
                control={<Radio size="medium" color="error" />}
              />
            </RadioGroup>
          </FormControl>
        </ComponentBox>
      ),
    },
  ];

  return (
    <ComponentLayout
      sectionData={DEMO_COMPONENTS}
      heroProps={{
        heading: 'Radio group',
        moreLinks: ['https://mui.com/material-ui/react-radio-button/'],
      }}
    />
  );
}
