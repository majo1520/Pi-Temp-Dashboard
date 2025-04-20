// Set line color based on location, with higher opacity for better visibility
const getSeriesColor = (location) => {
  const color = locationColors[location] || locationColors.default;
  return color;
};

// Adjust opacity for better visibility
const getFillOptions = () => {
  return {
    opacity: fullScreen ? 0.7 : 0.5,
    type: 'solid',
    gradient: {
      shade: 'light',
      type: "vertical",
      shadeIntensity: 0.7,
      opacityFrom: 0.8,
      opacityTo: 0.3,
    }
  };
}; 