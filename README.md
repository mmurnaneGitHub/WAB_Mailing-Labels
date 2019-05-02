# WAB_Mailing-Labels
Mailing Labels Widget for https://wsitd03/website/labels/

Version 2.12

INSTRUCTIONS:

   1. Copy Query folder from previous app version to \widgets\Query.  Replace Widget.js & SingleQueryResult.js from this repository.
   
   2. Copy MapManager.js to \jimu.js\MapManager.js.
   

 ==================== Modification of ESRI default files  ==================== 

   A. Files Widget.js & SingleQueryResult.js from the \widgets\Query folder - See //MJM modifications.
   
   B. File \jimu.js\MapManager.js - See //MJM modifications to change default layer visibity on web map.
   
   
   
 ==================== FUTURE ENHANCEMENTS ==================== 
 - remove blank line in spreadsheet for first record
 - try to get task without using index number - Widget.js, _MailingLabels_findIndex, line ~1182
 - rename widget and update app config.json or test if all other ESRI query widget files are compatible.  Folder currently has over 140 files.
