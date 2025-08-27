import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';

import { ComponentBox } from '../../layout';

// ----------------------------------------------------------------------

const SIZES = ['small', 'medium', 'large'];
const VARIANTS = ['contained', 'outlined', 'text', 'soft'];
const COLORS = ['inherit', 'primary', 'secondary', 'success', 'error', 'info', 'warning'];

// ----------------------------------------------------------------------

export function ButtonGroups() {
  const renderContent = () => [
    <Button key="one">One</Button>,
    <Button key="two">Two</Button>,
    <Button key="three">Three</Button>,
    <Button key="four">Four</Button>,
  ];

  const renderVariant = (title, variant) => (
    <ComponentBox title={title}>
      {COLORS.map((color) => (
        <ButtonGroup key={color} variant={variant} color={color}>
          {renderContent()}
        </ButtonGroup>
      ))}
      <ButtonGroup disabled variant={variant} color="info">
        {renderContent()}
      </ButtonGroup>
    </ComponentBox>
  );

  return (
    <>
      {renderVariant('Contained', 'contained')}
      {renderVariant('Outlined', 'outlined')}
      {renderVariant('Text', 'text')}
      {renderVariant('Soft', 'soft')}

      <ComponentBox title="Sizes">
        {SIZES.map((size) => (
          <ButtonGroup key={size} size={size} variant="contained">
            {renderContent()}
          </ButtonGroup>
        ))}
      </ComponentBox>

      <ComponentBox title="Orientation">
        {VARIANTS.map((variant) => (
          <ButtonGroup key={variant} variant={variant} orientation="vertical">
            {renderContent()}
          </ButtonGroup>
        ))}
        <ButtonGroup disabled variant="soft" color="info" orientation="vertical">
          {renderContent()}
        </ButtonGroup>
      </ComponentBox>
    </>
  );
}
