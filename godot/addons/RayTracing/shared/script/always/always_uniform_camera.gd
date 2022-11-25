@tool

extends Node

@onready var camera: FreeCamera3D = %FreeCamera3D

var material: ShaderMaterial
var control: Control

var post_process_material: ShaderMaterial

var gamma: float = 0.5
var focus: float = 2.0
var aperture: float = 0.005
var vfov: float = 30
var quality: float = 50

func _ready() -> void:
    control = %ShaderRect as Control
    material = control.material
    
    post_process_material = %PostProcessShader.material


func _process(_delta: float) -> void:
    var camera_position := camera.transform.origin
    var camera_rotation := camera.transform.basis
    var aspect := control.size.x / control.size.y
    camera.fov = clamp(vfov, 1, 179);


    material.set_shader_parameter("camera_position", camera_position)
    material.set_shader_parameter("camera_rotation", camera_rotation)
    material.set_shader_parameter("camera_aspect", aspect)
    material.set_shader_parameter("camera_vfov", vfov)
    material.set_shader_parameter("camera_focus", focus)
    material.set_shader_parameter("camera_aperture", aperture)
    material.set_shader_parameter("camera_gamma", gamma)
    
    material.set_shader_parameter("light_quality", 1 / quality)
