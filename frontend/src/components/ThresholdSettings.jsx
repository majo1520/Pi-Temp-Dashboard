import React from 'react';

/**
 * Reusable component for threshold settings
 * @param {Object} props - Component props
 * @param {string} props.title - Title for the threshold section
 * @param {Object} props.thresholdValues - Current threshold values
 * @param {Function} props.onUpdate - Function to call when threshold values change
 */
function ThresholdSettings({ title, thresholdValues, onUpdate }) {
  return (
    <div className="mt-2 space-y-2">
      <h3 className="font-semibold">{title} – 3 pásma</h3>
      
      <div className="flex items-center gap-2">
        <label>Min:</label>
        <input
          type="number"
          value={thresholdValues.min}
          onChange={(e) =>
            onUpdate({ 
              ...thresholdValues, 
              min: parseFloat(e.target.value) 
            })
          }
          className="border rounded px-2 py-1 w-16"
        />
        <input
          type="color"
          value={thresholdValues.colorMin}
          onChange={(e) =>
            onUpdate({ 
              ...thresholdValues, 
              colorMin: e.target.value 
            })
          }
          className="border rounded px-1 py-1"
        />
      </div>
      
      <div className="flex items-center gap-2">
        <label>Mid:</label>
        <input
          type="number"
          value={thresholdValues.mid}
          onChange={(e) =>
            onUpdate({ 
              ...thresholdValues, 
              mid: parseFloat(e.target.value) 
            })
          }
          className="border rounded px-2 py-1 w-16"
        />
        <input
          type="color"
          value={thresholdValues.colorMid}
          onChange={(e) =>
            onUpdate({ 
              ...thresholdValues, 
              colorMid: e.target.value 
            })
          }
          className="border rounded px-1 py-1"
        />
      </div>
      
      <div className="flex items-center gap-2">
        <label>High:</label>
        <input
          type="number"
          value={thresholdValues.high}
          onChange={(e) =>
            onUpdate({ 
              ...thresholdValues, 
              high: parseFloat(e.target.value) 
            })
          }
          className="border rounded px-2 py-1 w-16"
        />
        <input
          type="color"
          value={thresholdValues.colorHigh}
          onChange={(e) =>
            onUpdate({ 
              ...thresholdValues, 
              colorHigh: e.target.value 
            })
          }
          className="border rounded px-1 py-1"
        />
      </div>
    </div>
  );
}

export default React.memo(ThresholdSettings); 