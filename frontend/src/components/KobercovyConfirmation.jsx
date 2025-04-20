import React from 'react';
import { useChart } from '../contexts/ChartContext';
import { useFilter } from '../contexts/FilterContext';
import { useTranslation } from 'react-i18next';

/**
 * Component for the kobercovy graph confirmation dialog
 */
function KobercovyConfirmation() {
  const { t } = useTranslation();
  const { showKobercovyConfirmation, setShowKobercovyConfirmation, confirmKobercovySelection } = useChart();
  const { setSelectedLocations, setRangeKey } = useFilter();
  
  if (!showKobercovyConfirmation) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg max-w-md w-full">
        <h3 className="text-lg font-semibold mb-4">{t('switchToHeatmap') || 'Switch to heatmap?'}</h3>
        <p className="mb-6">
          {t('heatmapSwitchConfirmation') || 'Enabling the heatmap will turn off temperature, humidity and pressure charts and clear all location selections. Do you want to continue?'}
        </p>
        <div className="flex justify-end gap-3">
          <button 
            onClick={() => setShowKobercovyConfirmation(false)}
            className="px-4 py-2 bg-gray-300 dark:bg-gray-700 rounded"
          >
            {t('cancel')}
          </button>
          <button 
            onClick={() => confirmKobercovySelection(setSelectedLocations, setRangeKey)}
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            {t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(KobercovyConfirmation); 