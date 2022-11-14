@tool

extends Node

var material: ShaderMaterial
var control: Control


func _ready() -> void:
    control = get_parent() as Control
    material = control.material
    control.resized.connect(on_size_changed)
    action()


func action() -> void:
    var aspect := control.size.y / control.size.x
    material.set_shader_parameter("aspect", aspect)


func on_size_changed() -> void:
    action()
