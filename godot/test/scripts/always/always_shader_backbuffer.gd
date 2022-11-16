extends Node

@export var camera: FreeCamera3D

var material: ShaderMaterial
var textureRect: TextureRect

var image: Image

var frame: float = 0


func _ready() -> void:
	textureRect = get_parent()
	material = textureRect.material


func _process(_delta: float) -> void:
	if is_instance_valid(camera):
		if camera.moving:
			frame = 0
	if Input.is_action_pressed("ui_accept"):
		frame = 0

	frame += 1

	material.set_shader_parameter(
		"frame", frame)
