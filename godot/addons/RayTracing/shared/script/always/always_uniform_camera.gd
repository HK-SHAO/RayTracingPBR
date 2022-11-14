@tool

extends Node

@onready var camera: FreeCamera3D = %FreeCamera3D

var material: ShaderMaterial
var control: Control


func _ready() -> void:
    control = get_parent() as Control
    material = get_parent().material


func _process(_delta: float) -> void:
    var camera_position := camera.transform.origin
    var camera_rotation := camera.transform.basis
    var aspect := control.size.x / control.size.y
    var vfov := camera.fov


    material.set_shader_parameter("camera_position", camera_position)
    material.set_shader_parameter("camera_rotation", camera_rotation)
    material.set_shader_parameter("camera_aspect", aspect)
    material.set_shader_parameter("camera_vfov", vfov)
