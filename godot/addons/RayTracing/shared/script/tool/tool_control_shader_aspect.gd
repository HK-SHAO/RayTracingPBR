@tool

extends Node

var material: ShaderMaterial
var control: Control


func _ready() -> void:
	control = get_parent() as Control
	material = control.material

func _process(_delta):
	var aspect := control.size.x / control.size.y
	material.set_shader_parameter("aspect", aspect)
