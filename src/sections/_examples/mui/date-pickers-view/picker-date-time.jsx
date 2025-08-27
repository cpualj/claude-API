import dayjs from 'dayjs';
import { useState } from 'react';

import Box from '@mui/material/Box';
import { DateTimeField } from '@mui/x-date-pickers/DateTimeField';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { MobileDateTimePicker } from '@mui/x-date-pickers/MobileDateTimePicker';
import { StaticDateTimePicker } from '@mui/x-date-pickers/StaticDateTimePicker';
import { DesktopDateTimePicker } from '@mui/x-date-pickers/DesktopDateTimePicker';

import { ComponentBox } from '../../layout';
import { boxStyles, containerStyles, componentBoxStyles } from './picker-date';

// ----------------------------------------------------------------------

export function PickerDateTime() {
  const [value, setValue] = useState(dayjs('2025-05-25 09:30'));

  const pickerProps = {
    value,
    onChange: (newValue) => setValue(newValue),
  };

  return (
    <Box sx={containerStyles}>
      <Box sx={boxStyles}>
        <ComponentBox title="Basic" sx={componentBoxStyles}>
          <DateTimePicker {...pickerProps} label="Date time picker" />
          <DesktopDateTimePicker {...pickerProps} label="Desktop date time picker" />
          <MobileDateTimePicker {...pickerProps} label="Mobile date time picker" />
          <DateTimeField {...pickerProps} label="Date time field" />
        </ComponentBox>

        <ComponentBox title="Views playground" sx={componentBoxStyles}>
          <DateTimePicker
            {...pickerProps}
            label="Year, month, day, hours, minutes and seconds"
            views={['year', 'month', 'day', 'hours', 'minutes', 'seconds']}
          />
          <DateTimePicker
            {...pickerProps}
            label="Year, day, hours, minutes, seconds"
            views={['year', 'day', 'hours', 'minutes', 'seconds']}
          />
          <DateTimePicker {...pickerProps} label="day, hours" views={['day', 'hours']} />
          <DateTimePicker {...pickerProps} label="Disabled" disabled />
          <DateTimePicker {...pickerProps} label="Read only" readOnly />
          <DateTimePicker
            {...pickerProps}
            label="Error"
            slotProps={{ textField: { error: true } }}
          />
        </ComponentBox>
      </Box>

      <ComponentBox title="Static mode">
        <StaticDateTimePicker {...pickerProps} orientation="portrait" />
        <StaticDateTimePicker {...pickerProps} orientation="landscape" />
      </ComponentBox>
    </Box>
  );
}
