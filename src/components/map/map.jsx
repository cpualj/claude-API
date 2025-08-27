import ReactMap from 'react-map-gl/mapbox';

import { styled } from '@mui/material/styles';

import { CONFIG } from 'src/global-config';

// ----------------------------------------------------------------------

export function Map({ ref, sx, ...other }) {
  return (
    <MapRoot sx={sx}>
      <ReactMap ref={ref} mapboxAccessToken={CONFIG.mapboxApiKey} {...other} />
    </MapRoot>
  );
}

// ----------------------------------------------------------------------

const MapRoot = styled('div')({
  width: '100%',
  overflow: 'hidden',
  position: 'relative',
});
