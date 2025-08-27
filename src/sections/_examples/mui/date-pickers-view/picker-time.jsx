import dayjs from 'dayjs';
import { useState } from 'react';

import Box from '@mui/material/Box';
import { TimeField } from '@mui/x-date-pickers/TimeField';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { StaticTimePicker } from '@mui/x-date-pickers/StaticTimePicker';
import { MobileTimePicker } from '@mui/x-date-pickers/MobileTimePicker';
import { DesktopTimePicker } from '@mui/x-date-pickers/DesktopTimePicker';

import { ComponentBox } from '../../layout';
import { boxStyles, containerStyles, componentBoxStyles } from './picker-date';

// ----------------------------------------------------------------------

export function PickerTime() {
  const [value, setValue] = useState(dayjs('2025-05-25 09:30'));

  const pickerProps = {
    value,
    onChange: (newValue) => setValue(newValue),
  };

  return (
    <Box sx={containerStyles}>
      <Box sx={boxStyles}>
        <ComponentBox title="Basic" sx={componentBoxStyles}>
          <TimePicker {...pickerProps} label="Time picker" />
          <DesktopTimePicker {...pickerProps} label="Desktop time picker" />
          <MobileTimePicker {...pickerProps} label="Mobile time picker" />
          <TimeField {...pickerProps} label="Time field" />
        </ComponentBox>

        <ComponentBox title="Views playground" sx={componentBoxStyles}>
          <TimePicker {...pickerProps} label="12 hours" />
          <TimePicker {...pickerProps} ampm={false} label="24 hours" />
          <TimePicker
            {...pickerProps}
            label="Hours, minutes and seconds"
            views={['hours', 'minutes', 'seconds']}
          />
          <TimePicker
            {...pickerProps}
            label="Minutes and seconds"
            views={['minutes', 'seconds']}
            format="mm:ss"
          />
          <TimePicker {...pickerProps} label="Hours" views={['hours']} />
        </ComponentBox>
      </Box>

      <ComponentBox title="Static mode">
        <StaticTimePicker {...pickerProps} orientation="portrait" />
        <StaticTimePicker {...pickerProps} ampm orientation="landscape" openTo="minutes" />
      </ComponentBox>
    </Box>
  );
}
