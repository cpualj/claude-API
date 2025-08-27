import { useState, useCallback } from 'react';
import { formatPhoneNumber, formatPhoneNumberIntl } from 'react-phone-number-input/input';

import Box from '@mui/material/Box';

import { PhoneInput } from 'src/components/phone-input';

import { ComponentBox } from '../../layout';

// ----------------------------------------------------------------------

const componentBoxStyles = {
  pb: 3,
  flexDirection: 'column',
  alignItems: 'flex-start',
};

const FIXED_COUNTRY = 'AU';
const DEFAULT_COUNTRY = 'DE';
const DEFAULT_VALUE = '+61298765432';

const PHONE_CONFIGS = {
  AUTO: {
    title: 'Auto',
    props: { value: undefined },
  },

  DEFAULT_VALUE: {
    title: 'Default value',
    props: { value: DEFAULT_VALUE },
  },

  DEFAULT_COUNTRY: {
    title: `Default country`,
    props: { value: '', defaultCountry: DEFAULT_COUNTRY },
  },

  FIXED_COUNTRY: {
    title: `Fixed country`,
    props: { value: DEFAULT_VALUE, country: FIXED_COUNTRY },
  },

  FIXED_COUNTRY_INTL: {
    title: `Fixed country + international`,
    props: {
      value: DEFAULT_VALUE,
      country: FIXED_COUNTRY,
      withCountryCallingCode: true,
      international: true,
    },
  },

  FIXED_COUNTRY_INTL_NO_SELECT: {
    title: `Fixed country + international + hideSelect`,
    props: {
      value: DEFAULT_VALUE,
      country: FIXED_COUNTRY,
      withCountryCallingCode: true,
      international: true,
      hideSelect: true,
    },
  },
};

// ----------------------------------------------------------------------

export function PhoneInputs() {
  const [values, setValues] = useState({
    AUTO: PHONE_CONFIGS.AUTO.props.value,
    DEFAULT_VALUE: PHONE_CONFIGS.DEFAULT_VALUE.props.value,
    DEFAULT_COUNTRY: PHONE_CONFIGS.DEFAULT_COUNTRY.props.value,
    FIXED_COUNTRY: PHONE_CONFIGS.FIXED_COUNTRY.props.value,
    FIXED_COUNTRY_INTL: PHONE_CONFIGS.FIXED_COUNTRY_INTL.props.value,
    FIXED_COUNTRY_INTL_NO_SELECT: PHONE_CONFIGS.FIXED_COUNTRY_INTL_NO_SELECT.props.value,
  });

  const handleChange = useCallback(
    (key) => (newValue) => {
      setValues((prev) => ({ ...prev, [key]: newValue }));
    },
    []
  );

  return (
    <>
      {Object.entries(PHONE_CONFIGS).map(([key, { title, props }]) => {
        const typedKey = key;

        return (
          <ComponentBox key={key} title={title} sx={componentBoxStyles}>
            <PhoneInput
              {...props}
              label="Phone number"
              value={values[typedKey]}
              onChange={handleChange(typedKey)}
            />
            <DisplayValue value={values[typedKey]} />
          </ComponentBox>
        );
      })}
    </>
  );
}

// ----------------------------------------------------------------------

function DisplayValue({ value }) {
  return (
    <Box
      sx={{
        gap: 1,
        display: 'flex',
        typography: 'body2',
        flexDirection: 'column',
        '& span > span': {
          minWidth: 128,
          display: 'inline-flex',
        },
      }}
    >
      <span>
        <span>National:</span> <strong>{value ? formatPhoneNumber(value) : '-'}</strong>
      </span>
      <span>
        <span>International:</span> <strong>{value ? formatPhoneNumberIntl(value) : '-'}</strong>
      </span>
      <span>
        <span>Raw:</span> <strong>{value ? value : '-'}</strong>
      </span>
    </Box>
  );
}
