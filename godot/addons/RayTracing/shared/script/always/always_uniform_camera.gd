@tool

extends Node

@onready var camera: FreeCamera3D = %FreeCamera3D

var material: ShaderMaterial
var control: Control

var gamma: float = 0.5
var focus: float = 2.0
var aperture: float = 0.005
var vfov: float = 30

func _ready() -> void:
    control = get_parent() as Control
    material = get_parent().material


func _process(_delta: float) -> void:
    var camera_position := camera.transform.origin
    var camera_rotation := camera.transform.basis
    var aspect := control.size.x / control.size.y
    camera.fov = max(vfov, 1.0);


    material.set_shader_parameter("camera_position", camera_position)
    material.set_shader_parameter("camera_rotation", camera_rotation)
    material.set_shader_parameter("camera_aspect", aspect)
    material.set_shader_parameter("camera_vfov", vfov)
    material.set_shader_parameter("camera_gamma", gamma)
    material.set_shader_parameter("camera_focus", focus)
    material.set_shader_parameter("camera_aperture", aperture)
