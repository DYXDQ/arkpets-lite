#!/system/bin/sh
# 备份下载的模型，只保留内置白面鸮
# 使用方法: sh backup_models.sh

SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
RES_DIR="$SCRIPT_DIR/res"
BACKUP_DIR="$SCRIPT_DIR/../aap_backup_models"

mkdir -p "$BACKUP_DIR"

echo "正在备份下载的模型到: $BACKUP_DIR"
echo "保留: Ptilopsis/ (内置白面鸮)"
echo ""

cd "$RES_DIR" || exit 1

count=0
for item in *; do
    # 跳过 Ptilopsis、logo.png、splashIcon.png
    if [ "$item" = "Ptilopsis" ] || [ "$item" = "logo.png" ] || [ "$item" = "splashIcon.png" ]; then
        continue
    fi
    # 跳过 models_data.json（下载的模型索引）
    if [ "$item" = "models_data.json" ]; then
        mv "$item" "$BACKUP_DIR/" 2>/dev/null
        echo "  [备份] $item"
        count=$((count + 1))
        continue
    fi
    # 其他全部移走
    mv "$item" "$BACKUP_DIR/" 2>/dev/null
    echo "  [备份] $item"
    count=$((count + 1))
done

echo ""
echo "完成！共备份 $count 项"
echo ""
echo "恢复方法: mv $BACKUP_DIR/* $RES_DIR/"
