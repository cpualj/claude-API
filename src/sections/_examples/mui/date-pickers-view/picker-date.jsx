import dayjs from 'dayjs';
import { useState } from 'react';

import Box from '@mui/material/Box';
import { DateField } from '@mui/x-date-pickers/DateField';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { StaticDatePicker } from '@mui/x-date-pickers/StaticDatePicker';
import { MobileDatePicker } from '@mui/x-date-pickers/MobileDatePicker';
import { DesktopDatePicker } from '@mui/x-date-pickers/DesktopDatePicker';

import { ComponentBox } from '../../layout';

// ----------------------------------------------------------------------

export const containerStyles = {
  gap: 5,
  display: 'flex',
  flexDirection: 'column',
};

export const boxStyles = {
  rowGap: 5,
  columnGap: 3,
  display: 'grid',
  gridTemplateColumns: { xs: 'repeat(1, 1fr)', md: 'repeat(2, 1fr)' },
};

export const componentBoxStyles = {
  flexDirection: 'column',
  justifyContent: 'flex-start',
};

// ----------------------------------------------------------------------

export function PickerDate() {
  const [value, setValue] = useState(dayjs('2025-05-25 09:30'));

  const pickerProps = {
    value,
    onChange: (newValue) => setValue(newValue),
  };

  return (
    <Box sx={containerStyles}>
      <Box sx={boxStyles}>
        <ComponentBox title="Basic" sx={componentBoxStyles}>
          <DatePicker {...pickerProps} label="Date picker" />
          <DesktopDatePicker {...pickerProps} label="Desktop date picker" />
          <MobileDatePicker {...pickerProps} label="Mobile date picker" />
          <DateField {...pickerProps} label="Date field" />
        </ComponentBox>

        <ComponentBox title="Playground" sx={componentBoxStyles}>
          <DatePicker
            {...pickerProps}
            label="Year, month and day"
            views={['year', 'month', 'day']}
          />
          <DatePicker {...pickerProps} label="Month and year" views={['month', 'year']} />
          <DatePicker {...pickerProps} label="Day" views={['day']} />
        </ComponentBox>
      </Box>

      <ComponentBox title="Static mode">
        <StaticDatePicker {...pickerProps} orientation="portrait" />
        <StaticDatePicker {...pickerProps} orientation="landscape" />
      </ComponentBox>
    </Box>
  );
}
