# WAB_Mailing-Labels
Mailing Labels Widget for https://wsitd03/website/labels/

Version 2.14

INSTRUCTIONS:

   1. Replace manifest.json, Widget.js, & SingleQueryResult.js in \widgets\QueryLabels.
   
   2. Copy MapManager.js to \jimu.js\MapManager.js.
   

 ==================== Modification of ESRI Query Widget default files  ==================== 

   A. Modification of manifest.json, Widget.js, & SingleQueryResult.js from the Esri \widgets\Query folder - See //MJM modifications.
   
   B. File \jimu.js\MapManager.js - See //MJM modifications to change default layer visibity on web map.
   
   
   
 ==================== FUTURE ENHANCEMENTS ==================== 
 - QueryLabels: built from Esri Query Widget, update with future Esri updates of all other files.
 - Remove blank line in spreadsheet for first record.
 - Try to get task without using index number - Widget.js, _MailingLabels_findIndex, line ~1182.
 - Future updates: Test if all other ESRI Query Widget files are compatible.  Folder currently has over 140 files.
