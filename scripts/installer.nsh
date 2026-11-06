; Preserve user-created directories such as Qwriter\workspace during upgrades
; and uninstall. Only resources/locales are shipped directories; root files
; belong to the installation. Nonempty user directories keep INSTDIR in place.
!define MUI_DIRECTORYPAGE_TEXT_TOP "请选择 Qwriter 的安装目录。本地数据默认保存在该目录下的 Qwriter\workspace 文件夹。"

!macro customInstall
  ; This path is relative to the directory selected in the installer.
  ; Create only; never move or overwrite an existing user's workspace.
  CreateDirectory "$INSTDIR\Qwriter\workspace"
!macroend

!macro customRemoveFiles
  SetOutPath "$TEMP"
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  Delete "$INSTDIR\*"
  RMDir "$INSTDIR"
!macroend
