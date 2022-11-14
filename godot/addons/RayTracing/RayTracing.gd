@tool
extends EditorPlugin

const MainPanel = preload("res://addons/RayTracing/main_panel.tscn")

var main_panel_instance: Control

func _enter_tree() -> void:
    main_panel_instance = MainPanel.instantiate()
    
    # Add the main panel to the editor's main viewport.
    var ei := get_editor_interface()
    var ms := ei.get_editor_main_screen()
    ms.add_child(main_panel_instance)
    
    # Hide the main panel. Very much required.
    _make_visible(false)


func _exit_tree() -> void:
    if is_instance_valid(main_panel_instance):
        main_panel_instance.queue_free()

func _has_main_screen():
    return true


func _make_visible(visible):
    if is_instance_valid(main_panel_instance):
        main_panel_instance.visible = visible
        if visible:
            main_panel_instance.process_mode = Node.PROCESS_MODE_INHERIT
        else:
            main_panel_instance.process_mode = Node.PROCESS_MODE_DISABLED


func _get_plugin_name():
    return "RayTracing"


func _get_plugin_icon():
    return get_editor_interface().get_base_control().get_theme_icon("3D", "EditorIcons")

